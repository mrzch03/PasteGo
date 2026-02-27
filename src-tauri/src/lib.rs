#[macro_use]
extern crate objc;

mod ai;
mod clipboard;
mod db;

use db::{AiProvider, Database, Template};
use std::sync::Arc;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, EventTarget,
};

struct AppState {
    db: Arc<Database>,
    #[allow(dead_code)]
    monitor: clipboard::ClipboardMonitor,
}

#[tauri::command]
fn get_clips(
    state: tauri::State<AppState>,
    search: Option<String>,
    clip_type: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Vec<db::ClipItem>, String> {
    state
        .db
        .get_clips(
            search.as_deref(),
            clip_type.as_deref(),
            limit.unwrap_or(100),
            offset.unwrap_or(0),
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_clip(state: tauri::State<AppState>, id: String) -> Result<(), String> {
    state.db.delete_clip(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_pin(state: tauri::State<AppState>, id: String) -> Result<bool, String> {
    state.db.toggle_pin(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_old_clips(state: tauri::State<AppState>, keep_days: i64) -> Result<usize, String> {
    state
        .db
        .clear_old_clips(keep_days)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_templates(state: tauri::State<AppState>) -> Result<Vec<db::Template>, String> {
    state.db.get_templates().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_providers(state: tauri::State<AppState>) -> Result<Vec<db::AiProvider>, String> {
    state.db.get_providers().map_err(|e| e.to_string())
}

#[tauri::command]
fn save_provider(state: tauri::State<AppState>, provider: AiProvider) -> Result<(), String> {
    state
        .db
        .upsert_provider(&provider)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_provider(state: tauri::State<AppState>, id: String) -> Result<(), String> {
    state.db.delete_provider(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_template(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    template: Template,
) -> Result<(), String> {
    state
        .db
        .upsert_template(&template)
        .map_err(|e| e.to_string())?;
    register_template_shortcuts(&app, &state.db);
    Ok(())
}

#[tauri::command]
fn delete_template(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    id: String,
) -> Result<(), String> {
    state.db.delete_template(&id).map_err(|e| e.to_string())?;
    register_template_shortcuts(&app, &state.db);
    Ok(())
}

#[tauri::command]
async fn ai_generate(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    provider_id: Option<String>,
    prompt: String,
) -> Result<String, String> {
    let providers = state.db.get_providers().map_err(|e| e.to_string())?;
    let provider = if let Some(pid) = provider_id {
        providers.iter().find(|p| p.id == pid).cloned()
    } else {
        providers.iter().find(|p| p.is_default).cloned()
    };

    let provider = provider.ok_or("No AI provider configured. Please add one in Settings.")?;

    ai::stream_generate(
        app,
        &provider.kind,
        &provider.endpoint,
        &provider.model,
        &provider.api_key,
        &prompt,
    )
    .await
}

#[tauri::command]
fn read_image_base64(path: String) -> Result<String, String> {
    use std::fs;
    let data = fs::read(&path).map_err(|e| format!("Failed to read image: {}", e))?;
    Ok(base64_encode(&data))
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[(n >> 18 & 63) as usize] as char);
        result.push(CHARS[(n >> 12 & 63) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[(n >> 6 & 63) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(n & 63) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

/// Simulate Cmd+V keypress using macOS CGEvent API
fn simulate_cmd_v() {
    use core_graphics::event::{CGEvent, CGEventFlags, CGKeyCode};
    use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

    // Key code for 'V' on macOS is 9
    const KEY_V: CGKeyCode = 9;

    if let Ok(source) = CGEventSource::new(CGEventSourceStateID::HIDSystemState) {
        if let Ok(key_down) = CGEvent::new_keyboard_event(source.clone(), KEY_V, true) {
            key_down.set_flags(CGEventFlags::CGEventFlagCommand);
            key_down.post(core_graphics::event::CGEventTapLocation::HID);
        }
        if let Ok(key_up) = CGEvent::new_keyboard_event(source, KEY_V, false) {
            key_up.set_flags(CGEventFlags::CGEventFlagCommand);
            key_up.post(core_graphics::event::CGEventTapLocation::HID);
        }
    }
}

#[tauri::command]
async fn copy_and_paste(app: tauri::AppHandle, content: String) -> Result<(), String> {
    // 写入系统剪贴板
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(&content).map_err(|e| e.to_string())?;

    // 隐藏主窗口
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }

    // 等待焦点切换回目标应用
    std::thread::sleep(std::time::Duration::from_millis(200));

    // 模拟 Cmd+V 粘贴
    simulate_cmd_v();

    Ok(())
}

fn register_template_shortcuts(app: &tauri::AppHandle, db: &Database) {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    let _ = app.global_shortcut().unregister_all();

    // Re-register the static toggle shortcut
    let app_handle = app.clone();
    let _ = app.global_shortcut().on_shortcut(
        "CmdOrCtrl+Shift+V",
        move |_app, _shortcut, event| {
            if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                toggle_main_window(&app_handle);
            }
        },
    );

    // Register template shortcuts
    if let Ok(templates) = db.get_templates() {
        for tpl in templates {
            if let Some(ref shortcut) = tpl.shortcut {
                if shortcut.is_empty() {
                    continue;
                }
                let app_handle = app.clone();
                let template_id = tpl.id.clone();
                let _ = app.global_shortcut().on_shortcut(
                    shortcut.as_str(),
                    move |_app, _shortcut, event| {
                        if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                            let handle = app_handle.clone();
                            let tid = template_id.clone();
                            // Simulate Cmd+C then emit after a short delay
                            std::thread::spawn(move || {
                                // Hide window so target app regains focus
                                if let Some(win) = handle.get_webview_window("main") {
                                    let _ = win.hide();
                                }
                                // Wait for user to release shortcut keys + app focus switch
                                std::thread::sleep(std::time::Duration::from_millis(300));
                                simulate_cmd_c();
                                std::thread::sleep(std::time::Duration::from_millis(200));
                                if let Some(win) = handle.get_webview_window("main") {
                                    position_window_near_mouse(&win);
                                    let _ = win.show();
                                    let _ = win.set_focus();
                                }
                                let _ = handle.emit_to(
                                    EventTarget::webview_window("main"),
                                    "quick-template",
                                    &tid,
                                );
                            });
                        }
                    },
                );
            }
        }
    }
}

/// Simulate Cmd+C keypress using macOS CGEvent API
fn simulate_cmd_c() {
    use core_graphics::event::{CGEvent, CGEventFlags, CGKeyCode};
    use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

    // Key code for 'C' on macOS is 8
    const KEY_C: CGKeyCode = 8;

    if let Ok(source) = CGEventSource::new(CGEventSourceStateID::HIDSystemState) {
        if let Ok(key_down) = CGEvent::new_keyboard_event(source.clone(), KEY_C, true) {
            key_down.set_flags(CGEventFlags::CGEventFlagCommand);
            key_down.post(core_graphics::event::CGEventTapLocation::HID);
        }
        if let Ok(key_up) = CGEvent::new_keyboard_event(source, KEY_C, false) {
            key_up.set_flags(CGEventFlags::CGEventFlagCommand);
            key_up.post(core_graphics::event::CGEventTapLocation::HID);
        }
    }
}

/// 获取当前鼠标光标位置（macOS CGEvent API）
fn get_mouse_position() -> (f64, f64) {
    use core_graphics::event::CGEvent;
    use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

    if let Ok(source) = CGEventSource::new(CGEventSourceStateID::HIDSystemState) {
        if let Ok(event) = CGEvent::new(source) {
            let point = event.location();
            return (point.x, point.y);
        }
    }
    (0.0, 0.0)
}

/// 将窗口定位到鼠标光标附近，确保不超出屏幕边界
fn position_window_near_mouse(window: &tauri::WebviewWindow) {
    use tauri::{LogicalPosition, LogicalSize};

    let (mouse_x, mouse_y) = get_mouse_position();

    // 获取窗口尺寸
    let win_size = window
        .outer_size()
        .map(|s| {
            let scale = window.scale_factor().unwrap_or(1.0);
            LogicalSize {
                width: s.width as f64 / scale,
                height: s.height as f64 / scale,
            }
        })
        .unwrap_or(LogicalSize {
            width: 400.0,
            height: 600.0,
        });

    // 获取当前屏幕尺寸和位置
    let (screen_x, screen_y, screen_w, screen_h) = window
        .current_monitor()
        .ok()
        .flatten()
        .map(|m| {
            let pos = m.position();
            let size = m.size();
            let scale = m.scale_factor();
            (
                pos.x as f64 / scale,
                pos.y as f64 / scale,
                size.width as f64 / scale,
                size.height as f64 / scale,
            )
        })
        .unwrap_or((0.0, 0.0, 1920.0, 1080.0));

    // 偏移量：窗口出现在鼠标右下方一点
    let offset = 10.0;
    let mut x = mouse_x + offset;
    let mut y = mouse_y + offset;

    // 确保窗口不超出屏幕右边界
    if x + win_size.width > screen_x + screen_w {
        x = mouse_x - win_size.width - offset;
    }
    // 确保窗口不超出屏幕下边界
    if y + win_size.height > screen_y + screen_h {
        y = mouse_y - win_size.height - offset;
    }
    // 确保不超出左上边界
    if x < screen_x {
        x = screen_x;
    }
    if y < screen_y {
        y = screen_y;
    }

    let _ = window.set_position(LogicalPosition::new(x, y));
}

fn toggle_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            position_window_near_mouse(&window);
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // Hide from Dock (agent mode)
            unsafe {
                use cocoa::appkit::{NSApp, NSApplication, NSApplicationActivationPolicy};
                NSApp().setActivationPolicy_(NSApplicationActivationPolicy::NSApplicationActivationPolicyAccessory);
            }

            // 窗口圆角
            if let Some(window) = app.get_webview_window("main") {
                #[allow(deprecated)]
                let ns_win = window.ns_window().unwrap() as cocoa::base::id;
                unsafe {
                    use cocoa::appkit::{NSView, NSWindow};
                    use cocoa::base::{NO, YES};
                    ns_win.setOpaque_(NO);
                    ns_win.setBackgroundColor_(cocoa::appkit::NSColor::clearColor(cocoa::base::nil));
                    let content_view: cocoa::base::id = ns_win.contentView();
                    content_view.setWantsLayer(YES);
                    let layer: cocoa::base::id = msg_send![content_view, layer];
                    let _: () = msg_send![layer, setCornerRadius: 12.0_f64];
                    let _: () = msg_send![layer, setMasksToBounds: YES];
                }
            }

            // Database setup
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_dir).expect("Failed to create app data dir");
            let db_path = app_dir.join("pastego.db");
            let images_dir = app_dir.join("images");
            let db = Arc::new(Database::new(&db_path).expect("Failed to open database"));

            // Clipboard monitor
            let monitor = clipboard::ClipboardMonitor::new();
            monitor.start(app.handle().clone(), db.clone(), images_dir);

            app.manage(AppState { db: db.clone(), monitor });

            // Register global shortcuts (static + template-based)
            register_template_shortcuts(app.handle(), &db);

            // System tray
            let show = MenuItemBuilder::with_id("show", "显示 PasteGo  Cmd+Shift+V").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show)
                .separator()
                .item(&quit)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(Image::from_bytes(include_bytes!("../icons/32x32.png"))?)
                .menu(&menu)
                .tooltip("PasteGo - 剪贴板 AI 助手")
                .on_menu_event(
                    |app: &tauri::AppHandle, event: tauri::menu::MenuEvent| {
                        match event.id().as_ref() {
                            "show" => {
                                if let Some(window) = app.get_webview_window("main") {
                                    position_window_near_mouse(&window);
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                            "quit" => {
                                app.exit(0);
                            }
                            _ => {}
                        }
                    },
                )
                .on_tray_icon_event(
                    |tray: &tauri::tray::TrayIcon, event: TrayIconEvent| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            ..
                        } = event
                        {
                            toggle_main_window(tray.app_handle());
                        }
                    },
                )
                .build(app)?;

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_clips,
            delete_clip,
            toggle_pin,
            clear_old_clips,
            get_templates,
            save_template,
            delete_template,
            get_providers,
            save_provider,
            delete_provider,
            ai_generate,
            read_image_base64,
            copy_and_paste,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
