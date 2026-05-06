use crate::db::{compute_hash, AppState};
use crate::pipeline::{ClipboardItem, Pipeline, PipelineOutcome};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager, State};

// --- helpers ----------------------------------------------------------------

fn parse_tags(raw: Option<String>) -> Vec<String> {
    raw.and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn parse_metadata(raw: Option<String>) -> HashMap<String, Vec<String>> {
    raw.and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

async fn emit_changed(app: &AppHandle) {
    let _ = app.emit("clipboard-changed", ());
}

// --- ingest -----------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestPayload {
    pub content_type: String,
    pub content: String,
    #[serde(default)]
    pub source_app: Option<String>,
    #[serde(default)]
    pub metadata: HashMap<String, Vec<String>>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IngestResult {
    pub accepted: bool,
    pub item_id: Option<i64>,
    pub deduped: bool,
    pub tags: Vec<String>,
    pub metadata: HashMap<String, Vec<String>>,
    pub dropped_by: Option<String>,
    pub reason: Option<String>,
}

#[tauri::command]
pub async fn ingest_clipboard(
    app: AppHandle,
    state: State<'_, AppState>,
    payload: IngestPayload,
) -> Result<IngestResult, String> {
    let mut metadata = payload.metadata;
    if let Some(app_name) = payload.source_app {
        if !app_name.is_empty() {
            metadata.insert("sourceApp".to_string(), vec![app_name]);
        }
    }

    let raw = ClipboardItem {
        content_type: payload.content_type,
        content: payload.content,
        source_app: None,
        metadata,
        tags: Vec::new(),
    };

    let processed = match Pipeline::default().run(raw) {
        PipelineOutcome::Accepted(item) => item,
        PipelineOutcome::Dropped { interceptor, reason } => {
            return Ok(IngestResult {
                accepted: false,
                item_id: None,
                deduped: false,
                tags: Vec::new(),
                metadata: HashMap::new(),
                dropped_by: Some(interceptor.to_string()),
                reason: Some(reason),
            });
        }
    };

    let pool = &state.pool;
    let hash = compute_hash(&processed.content_type, &processed.content);

    // dedup by content_hash
    let existing: Option<i64> = sqlx::query("SELECT id FROM clipboard_items WHERE content_hash = ?1 LIMIT 1")
        .bind(&hash)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .map(|row| row.get::<i64, _>("id"));

    let metadata_json = serde_json::to_string(&processed.metadata).unwrap_or_else(|_| "{}".into());
    let tags_json = serde_json::to_string(&processed.tags).unwrap_or_else(|_| "[]".into());

    let (item_id, deduped) = if let Some(id) = existing {
        sqlx::query(
            "UPDATE clipboard_items
             SET last_used_at = CURRENT_TIMESTAMP,
                 use_count    = use_count + 1,
                 metadata     = COALESCE(NULLIF(metadata, ''), ?1)
             WHERE id = ?2",
        )
        .bind(&metadata_json)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
        (id, true)
    } else {
        let (preview, storage) = if processed.content_type == "text" {
            (Some(processed.content.as_str()), None)
        } else {
            (None, Some(processed.content.as_str()))
        };
        let new_id = sqlx::query(
            "INSERT INTO clipboard_items
                (content_type, content_hash, preview_text, storage_path, tags, metadata, use_count, last_used_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, CURRENT_TIMESTAMP)",
        )
        .bind(&processed.content_type)
        .bind(&hash)
        .bind(preview)
        .bind(storage)
        .bind(&tags_json)
        .bind(&metadata_json)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?
        .last_insert_rowid();
        (new_id, false)
    };

    emit_changed(&app).await;

    Ok(IngestResult {
        accepted: true,
        item_id: Some(item_id),
        deduped,
        tags: processed.tags,
        metadata: processed.metadata,
        dropped_by: None,
        reason: None,
    })
}

// --- read -------------------------------------------------------------------

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HistoryItem {
    pub id: i64,
    pub content_type: String,
    pub content: String,
    pub created_at: Option<String>,
    pub last_used_at: Option<String>,
    pub use_count: i64,
    pub pinned: bool,
    pub tags: Vec<String>,
    pub metadata: HashMap<String, Vec<String>>,
}

#[tauri::command]
pub async fn load_history(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<HistoryItem>, String> {
    let limit = limit.unwrap_or(5000).clamp(1, 10000);
    let rows = sqlx::query(
        "SELECT id, content_type, preview_text, storage_path, created_at, last_used_at,
                use_count, is_pinned, tags, metadata
         FROM clipboard_items
         ORDER BY is_pinned DESC, last_used_at DESC, created_at DESC
         LIMIT ?1",
    )
    .bind(limit)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    let items = rows
        .into_iter()
        .map(|row| {
            let content_type: String = row.get("content_type");
            let preview: Option<String> = row.try_get("preview_text").ok();
            let storage: Option<String> = row.try_get("storage_path").ok();
            let content = if content_type == "text" {
                preview.unwrap_or_default()
            } else {
                storage.unwrap_or_default()
            };
            HistoryItem {
                id: row.get("id"),
                content_type,
                content,
                created_at: row.try_get("created_at").ok(),
                last_used_at: row.try_get("last_used_at").ok(),
                use_count: row.try_get("use_count").unwrap_or(0),
                pinned: row.try_get::<i64, _>("is_pinned").unwrap_or(0) != 0,
                tags: parse_tags(row.try_get("tags").ok()),
                metadata: parse_metadata(row.try_get("metadata").ok()),
            }
        })
        .collect();
    Ok(items)
}

// --- mutations --------------------------------------------------------------

#[tauri::command]
pub async fn toggle_pin(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
) -> Result<bool, String> {
    let res = sqlx::query(
        "UPDATE clipboard_items
         SET is_pinned = CASE WHEN is_pinned = 1 THEN 0 ELSE 1 END
         WHERE id = ?1
         RETURNING is_pinned",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("item {} not found", id))?;

    emit_changed(&app).await;
    Ok(res.get::<i64, _>("is_pinned") != 0)
}

#[tauri::command]
pub async fn delete_item(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
) -> Result<(), String> {
    sqlx::query("DELETE FROM clipboard_items WHERE id = ?1")
        .bind(id)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    emit_changed(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn set_tags(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
    tags: Vec<String>,
) -> Result<Vec<String>, String> {
    // 去重 + 去空白
    let mut seen = std::collections::HashSet::new();
    let cleaned: Vec<String> = tags
        .into_iter()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .filter(|t| seen.insert(t.clone()))
        .collect();
    let json = serde_json::to_string(&cleaned).unwrap_or_else(|_| "[]".into());

    let affected = sqlx::query("UPDATE clipboard_items SET tags = ?1 WHERE id = ?2")
        .bind(&json)
        .bind(id)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?
        .rows_affected();

    if affected == 0 {
        return Err(format!("item {} not found", id));
    }

    emit_changed(&app).await;
    Ok(cleaned)
}

#[tauri::command]
pub async fn mark_used(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE clipboard_items
         SET use_count = use_count + 1,
             last_used_at = CURRENT_TIMESTAMP
         WHERE id = ?1",
    )
    .bind(id)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;
    emit_changed(&app).await;
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMetadata {
    pub path: String,
    pub size: u64,
}

#[tauri::command]
pub async fn read_clipboard_files() -> Result<Vec<FileMetadata>, String> {
    #[cfg(target_os = "windows")]
    {
        use clipboard_win::{formats, get_clipboard};
        if let Ok(files) = get_clipboard::<Vec<String>, _>(formats::FileList) {
            let res = files.into_iter().map(|path| {
                let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                FileMetadata { path, size }
            }).collect();
            return Ok(res);
        }
    }
    Err("No files".to_string())
}

#[tauri::command]
pub async fn get_active_window() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};
        unsafe {
            let hwnd = GetForegroundWindow();
            if !hwnd.is_invalid() {
                let mut buf = [0u16; 512];
                let len = GetWindowTextW(hwnd, &mut buf);
                if len > 0 {
                    return Ok(String::from_utf16_lossy(&buf[..len as usize]));
                }
            }
        }
    }
    Err("Not supported".to_string())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub cache_path: String,
    pub shortcut: String,
    #[serde(default = "default_auto_paste")]
    pub auto_paste: bool,
    #[serde(default = "default_keep_window_open")]
    pub keep_window_open: bool,
    #[serde(default = "default_page_size")]
    pub page_size: u32,
    #[serde(default = "default_history_limit")]
    pub history_limit: u32,
    #[serde(default = "default_string")]
    pub webdav_url: String,
    #[serde(default = "default_string")]
    pub webdav_username: String,
    #[serde(default = "default_string")]
    pub webdav_password: String,
    #[serde(default = "default_bool_false")]
    pub webdav_sync_enabled: bool,
}

fn default_auto_paste() -> bool { true }
fn default_keep_window_open() -> bool { false }
fn default_bool_false() -> bool { false }
fn default_string() -> String { "".to_string() }
fn default_page_size() -> u32 { 50 }
fn default_history_limit() -> u32 { 5000 }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigResponse {
    pub cache_path: String,
    pub shortcut: String,
    pub default_dir: String,
    pub effective_dir: String,
    pub auto_paste: bool,
    pub keep_window_open: bool,
    pub page_size: u32,
    pub history_limit: u32,
    pub webdav_url: String,
    pub webdav_username: String,
    pub webdav_password: String,
    pub webdav_sync_enabled: bool,
}

#[tauri::command]
pub async fn get_config(app: AppHandle) -> Result<ConfigResponse, String> {
    let app_data = app.path().app_data_dir().unwrap();
    let conf_path = app_data.join("config.json");
    
    let mut cache_path = "".to_string();
    let mut shortcut = "CommandOrControl+Shift+E".to_string();
    let mut auto_paste = true;
    let mut keep_window_open = false;
    let mut page_size = 50;
    let mut history_limit = 5000;
    let mut webdav_url = "".to_string();
    let mut webdav_username = "".to_string();
    let mut webdav_password = "".to_string();
    let mut webdav_sync_enabled = false;

    if let Ok(data) = std::fs::read_to_string(&conf_path) {
        if let Ok(conf) = serde_json::from_str::<AppConfig>(&data) {
            cache_path = conf.cache_path;
            shortcut = conf.shortcut;
            auto_paste = conf.auto_paste;
            keep_window_open = conf.keep_window_open;
            page_size = conf.page_size;
            history_limit = conf.history_limit;
            webdav_url = conf.webdav_url;
            webdav_username = conf.webdav_username;
            webdav_password = conf.webdav_password;
            webdav_sync_enabled = conf.webdav_sync_enabled;
        }
    }

    let default_dir = app_data.to_string_lossy().to_string();
    let effective_dir = if cache_path.is_empty() {
        default_dir.clone()
    } else {
        cache_path.clone()
    };

    Ok(ConfigResponse {
        cache_path,
        shortcut,
        default_dir,
        effective_dir,
        auto_paste,
        keep_window_open,
        page_size,
        history_limit,
        webdav_url,
        webdav_username,
        webdav_password,
        webdav_sync_enabled,
    })
}

#[tauri::command]
pub async fn set_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
    let conf_path = app.path().app_data_dir().unwrap().join("config.json");
    let data = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    std::fs::write(&conf_path, data).map_err(|e| e.to_string())?;
    Ok(())
}
