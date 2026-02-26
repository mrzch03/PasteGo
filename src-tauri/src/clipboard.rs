use crate::db::{ClipItem, Database};
use arboard::Clipboard;
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

pub struct ClipboardMonitor {
    running: Arc<AtomicBool>,
}

impl ClipboardMonitor {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn start(&self, app: AppHandle, db: Arc<Database>, images_dir: std::path::PathBuf) {
        let running = self.running.clone();
        running.store(true, Ordering::SeqCst);

        std::thread::spawn(move || {
            let mut clipboard = Clipboard::new().expect("Failed to access clipboard");
            let mut last_text_hash = String::new();
            let mut last_image_hash = String::new();

            while running.load(Ordering::SeqCst) {
                // Check for text
                if let Ok(text) = clipboard.get_text() {
                    if !text.trim().is_empty() {
                        let hash = compute_hash(&text);
                        if hash != last_text_hash {
                            last_text_hash = hash.clone();
                            let clip_type = detect_type(&text);
                            let item = ClipItem {
                                id: uuid::Uuid::new_v4().to_string(),
                                content: text,
                                content_hash: hash,
                                clip_type,
                                source_app: get_frontmost_app(),
                                image_path: None,
                                is_pinned: false,
                                created_at: chrono::Utc::now().to_rfc3339(),
                            };
                            if let Ok(true) = db.insert_clip(&item) {
                                let _ = app.emit("clipboard-changed", &item);
                            }
                        }
                    }
                }

                // Check for image
                if let Ok(img) = clipboard.get_image() {
                    let raw_bytes = img.bytes.as_ref();
                    let hash = compute_hash_bytes(raw_bytes);
                    if hash != last_image_hash {
                        last_image_hash = hash.clone();
                        // Save image to disk
                        if let Some(path) = save_image(&images_dir, &hash, &img) {
                            let item = ClipItem {
                                id: uuid::Uuid::new_v4().to_string(),
                                content: format!("[图片 {}x{}]", img.width, img.height),
                                content_hash: hash,
                                clip_type: "image".to_string(),
                                source_app: get_frontmost_app(),
                                image_path: Some(path),
                                is_pinned: false,
                                created_at: chrono::Utc::now().to_rfc3339(),
                            };
                            if let Ok(true) = db.insert_clip(&item) {
                                let _ = app.emit("clipboard-changed", &item);
                            }
                        }
                    }
                }

                std::thread::sleep(std::time::Duration::from_millis(500));
            }
        });
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }
}

fn compute_hash(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    hex::encode(hasher.finalize())
}

fn compute_hash_bytes(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

fn detect_type(text: &str) -> String {
    let trimmed = text.trim();

    // URL detection
    if trimmed.starts_with("http://")
        || trimmed.starts_with("https://")
        || trimmed.starts_with("ftp://")
    {
        if !trimmed.contains('\n') {
            return "url".to_string();
        }
    }

    // Code detection heuristics
    let code_indicators = [
        "fn ", "func ", "def ", "class ", "import ", "from ", "#include",
        "const ", "let ", "var ", "function ", "return ", "if (", "for (",
        "while (", "pub fn", "async ", "await ", "=>", "->", "::", "println!",
        "console.log", "System.out", "<?php", "package ", "struct ",
    ];
    let line_count = trimmed.lines().count();
    let has_braces = trimmed.contains('{') && trimmed.contains('}');
    let indicator_count = code_indicators
        .iter()
        .filter(|&&ind| trimmed.contains(ind))
        .count();

    if (indicator_count >= 2 && line_count >= 3) || (has_braces && indicator_count >= 1 && line_count >= 5) {
        return "code".to_string();
    }

    "text".to_string()
}

fn save_image(
    dir: &std::path::Path,
    hash: &str,
    img: &arboard::ImageData,
) -> Option<String> {
    std::fs::create_dir_all(dir).ok()?;
    let filename = format!("{}.png", &hash[..16]);
    let path = dir.join(&filename);

    // Convert RGBA raw data to PNG
    let width = img.width as u32;
    let height = img.height as u32;
    let rgba_data = img.bytes.as_ref();

    let file = std::fs::File::create(&path).ok()?;
    let writer = std::io::BufWriter::new(file);
    let mut encoder = png::Encoder::new(writer, width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().ok()?;
    writer.write_image_data(rgba_data).ok()?;

    Some(path.to_string_lossy().to_string())
}

fn get_frontmost_app() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let output = Command::new("osascript")
            .args(["-e", "tell application \"System Events\" to get name of first application process whose frontmost is true"])
            .output()
            .ok()?;
        let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if name.is_empty() { None } else { Some(name) }
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}
