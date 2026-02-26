use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipItem {
    pub id: String,
    pub content: String,
    pub content_hash: String,
    pub clip_type: String, // text, code, url, image
    pub source_app: Option<String>,
    pub image_path: Option<String>,
    pub is_pinned: bool,
    pub created_at: String,
}

pub struct Database {
    conn: Mutex<rusqlite::Connection>,
}

impl Database {
    pub fn new(db_path: &Path) -> Result<Self, rusqlite::Error> {
        let conn = rusqlite::Connection::open(db_path)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS clip_items (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                content_hash TEXT NOT NULL UNIQUE,
                clip_type TEXT NOT NULL DEFAULT 'text',
                source_app TEXT,
                image_path TEXT,
                is_pinned INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_clip_items_created_at ON clip_items(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_clip_items_hash ON clip_items(content_hash);
            CREATE INDEX IF NOT EXISTS idx_clip_items_type ON clip_items(clip_type);

            CREATE TABLE IF NOT EXISTS ai_providers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                kind TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                model TEXT NOT NULL,
                api_key TEXT NOT NULL DEFAULT '',
                is_default INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS templates (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                prompt TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'general',
                shortcut TEXT
            );",
        )?;
        // Migration: add api_key column if missing
        let _ = conn.execute("ALTER TABLE ai_providers ADD COLUMN api_key TEXT NOT NULL DEFAULT ''", []);
        // Migration: add shortcut column to templates if missing
        let _ = conn.execute("ALTER TABLE templates ADD COLUMN shortcut TEXT", []);

        // Migration: clean up old preset templates, keep only tpl-translate
        conn.execute(
            "DELETE FROM templates WHERE id IN ('tpl-summary','tpl-weekly','tpl-email','tpl-compare','tpl-rewrite')",
            [],
        )?;
        // Ensure tpl-translate has a default shortcut
        conn.execute(
            "UPDATE templates SET shortcut = 'CmdOrCtrl+Shift+T' WHERE id = 'tpl-translate' AND shortcut IS NULL",
            [],
        )?;

        // Insert default templates if empty
        let count: i64 =
            conn.query_row("SELECT COUNT(*) FROM templates", [], |row| row.get(0))?;
        if count == 0 {
            conn.execute_batch(
                "INSERT INTO templates (id, name, prompt, category, shortcut) VALUES
                ('tpl-translate', '翻译', '请将以下内容翻译为中文（如已是中文则翻译为英文）：\n\n{{materials}}', 'general', 'CmdOrCtrl+Shift+T');",
            )?;
        }
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn insert_clip(&self, item: &ClipItem) -> Result<bool, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        // Check for duplicate by hash
        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM clip_items WHERE content_hash = ?1)",
            [&item.content_hash],
            |row| row.get(0),
        )?;
        if exists {
            // Update created_at to bump it to top
            conn.execute(
                "UPDATE clip_items SET created_at = ?1 WHERE content_hash = ?2",
                rusqlite::params![&item.created_at, &item.content_hash],
            )?;
            return Ok(false);
        }
        conn.execute(
            "INSERT INTO clip_items (id, content, content_hash, clip_type, source_app, image_path, is_pinned, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                &item.id,
                &item.content,
                &item.content_hash,
                &item.clip_type,
                &item.source_app,
                &item.image_path,
                item.is_pinned as i32,
                &item.created_at,
            ],
        )?;
        Ok(true)
    }

    pub fn get_clips(
        &self,
        search: Option<&str>,
        clip_type: Option<&str>,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<ClipItem>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut sql = String::from(
            "SELECT id, content, content_hash, clip_type, source_app, image_path, is_pinned, created_at FROM clip_items WHERE 1=1",
        );
        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(s) = search {
            if !s.is_empty() {
                sql.push_str(" AND content LIKE ?");
                params.push(Box::new(format!("%{}%", s)));
            }
        }
        if let Some(t) = clip_type {
            if !t.is_empty() && t != "all" {
                sql.push_str(" AND clip_type = ?");
                params.push(Box::new(t.to_string()));
            }
        }
        sql.push_str(" ORDER BY is_pinned DESC, created_at DESC LIMIT ? OFFSET ?");
        params.push(Box::new(limit as i64));
        params.push(Box::new(offset as i64));

        let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let mut stmt = conn.prepare(&sql)?;
        let items = stmt
            .query_map(param_refs.as_slice(), |row| {
                Ok(ClipItem {
                    id: row.get(0)?,
                    content: row.get(1)?,
                    content_hash: row.get(2)?,
                    clip_type: row.get(3)?,
                    source_app: row.get(4)?,
                    image_path: row.get(5)?,
                    is_pinned: row.get::<_, i32>(6)? != 0,
                    created_at: row.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(items)
    }

    pub fn delete_clip(&self, id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM clip_items WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn toggle_pin(&self, id: &str) -> Result<bool, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE clip_items SET is_pinned = CASE WHEN is_pinned = 0 THEN 1 ELSE 0 END WHERE id = ?1",
            [id],
        )?;
        let pinned: bool = conn.query_row(
            "SELECT is_pinned FROM clip_items WHERE id = ?1",
            [id],
            |row| row.get::<_, i32>(0).map(|v| v != 0),
        )?;
        Ok(pinned)
    }

    pub fn clear_old_clips(&self, keep_days: i64) -> Result<usize, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let cutoff = chrono::Utc::now() - chrono::Duration::days(keep_days);
        let cutoff_str = cutoff.to_rfc3339();
        let deleted = conn.execute(
            "DELETE FROM clip_items WHERE is_pinned = 0 AND created_at < ?1",
            [&cutoff_str],
        )?;
        Ok(deleted)
    }

    pub fn get_templates(&self) -> Result<Vec<Template>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, name, prompt, category, shortcut FROM templates ORDER BY category, name")?;
        let items = stmt
            .query_map([], |row| {
                Ok(Template {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    prompt: row.get(2)?,
                    category: row.get(3)?,
                    shortcut: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(items)
    }

    pub fn upsert_template(&self, tpl: &Template) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO templates (id, name, prompt, category, shortcut) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![&tpl.id, &tpl.name, &tpl.prompt, &tpl.category, &tpl.shortcut],
        )?;
        Ok(())
    }

    pub fn delete_template(&self, id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM templates WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn get_providers(&self) -> Result<Vec<AiProvider>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, name, kind, endpoint, model, api_key, is_default FROM ai_providers ORDER BY name")?;
        let items = stmt
            .query_map([], |row| {
                Ok(AiProvider {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    kind: row.get(2)?,
                    endpoint: row.get(3)?,
                    model: row.get(4)?,
                    api_key: row.get(5)?,
                    is_default: row.get::<_, i32>(6)? != 0,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(items)
    }

    pub fn upsert_provider(&self, provider: &AiProvider) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        if provider.is_default {
            conn.execute("UPDATE ai_providers SET is_default = 0", [])?;
        }
        conn.execute(
            "INSERT OR REPLACE INTO ai_providers (id, name, kind, endpoint, model, api_key, is_default) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                &provider.id,
                &provider.name,
                &provider.kind,
                &provider.endpoint,
                &provider.model,
                &provider.api_key,
                provider.is_default as i32,
            ],
        )?;
        Ok(())
    }

    pub fn delete_provider(&self, id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM ai_providers WHERE id = ?1", [id])?;
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Template {
    pub id: String,
    pub name: String,
    pub prompt: String,
    pub category: String,
    pub shortcut: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiProvider {
    pub id: String,
    pub name: String,
    pub kind: String, // openai, claude, ollama, kimi, minimax
    pub endpoint: String,
    pub model: String,
    pub api_key: String,
    pub is_default: bool,
}
