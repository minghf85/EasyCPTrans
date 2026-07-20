use crate::db::{compute_hash, AppState};
use crate::pipeline::{ClipboardItem, Pipeline, PipelineOutcome};
use crate::privacy::{
    decrypt_content, encrypt_content, has_password, has_security_question, load_privacy_config,
    save_privacy_config, set_password, PrivacyStatus,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::collections::{HashMap, HashSet};
use tauri::{AppHandle, Emitter, Manager, State};

const PRIVACY_TAG: &str = "隐私";

fn is_privacy_tag(tag: &str) -> bool {
    let normalized = tag.trim().to_lowercase();
    normalized == "隐私" || normalized == "privacy" || normalized == "private"
}

fn remove_privacy_tags(tags: Vec<String>) -> Vec<String> {
    tags.into_iter().filter(|t| !is_privacy_tag(t)).collect()
}

fn parse_tags(raw: Option<String>) -> Vec<String> {
    raw.and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn parse_metadata(raw: Option<String>) -> HashMap<String, Vec<String>> {
    raw.and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn default_device_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "This Device".to_string())
}

fn sanitize_device_name(value: String) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        default_device_name()
    } else {
        trimmed.to_string()
    }
}

fn merge_unique_tags(existing: Vec<String>, incoming: Vec<String>) -> Vec<String> {
    let mut result = Vec::new();
    let mut seen = HashSet::new();
    for tag in existing.into_iter().chain(incoming.into_iter()) {
        let cleaned = tag.trim();
        if cleaned.is_empty() {
            continue;
        }
        let key = cleaned.to_lowercase();
        if seen.insert(key) {
            result.push(cleaned.to_string());
        }
    }
    result
}

fn read_app_config(app: &AppHandle) -> AppConfig {
    let conf_path = app.path().app_data_dir().unwrap().join("config.json");
    if let Ok(data) = std::fs::read_to_string(&conf_path) {
        if let Ok(conf) = serde_json::from_str::<AppConfig>(&data) {
            return conf;
        }
    }
    AppConfig {
        cache_path: "".to_string(),
        shortcut: "CommandOrControl+Shift+E".to_string(),
        auto_paste: true,
        keep_window_open: false,
        always_on_top: false,
        page_size: 50,
        history_limit: 5000,
        webdav_url: "".to_string(),
        webdav_username: "".to_string(),
        webdav_password: "".to_string(),
        webdav_sync_enabled: false,
        device_name: default_device_name(),
    }
}

async fn emit_changed(app: &AppHandle) {
    let _ = app.emit("clipboard-changed", ());
}

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

    let mut raw = ClipboardItem {
        content_type: payload.content_type,
        content: payload.content,
        source_app: None,
        metadata,
        tags: Vec::new(),
    };
    let cfg = read_app_config(&app);
    let device_tag = sanitize_device_name(cfg.device_name);
    raw.tags.push(device_tag);

    let mut processed = match Pipeline::default().run(raw) {
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

    let existing = sqlx::query(
        "SELECT id, tags FROM clipboard_items WHERE content_hash = ?1 AND (is_private IS NULL OR is_private = 0) LIMIT 1",
    )
    .bind(&hash)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(ref row) = existing {
        let existing_tags = parse_tags(row.try_get("tags").ok());
        processed.tags = merge_unique_tags(existing_tags, processed.tags.clone());
    }

    let metadata_json = serde_json::to_string(&processed.metadata).unwrap_or_else(|_| "{}".into());
    let tags_json = serde_json::to_string(&processed.tags).unwrap_or_else(|_| "[]".into());

    let (item_id, deduped) = if let Some(row) = existing {
        let id: i64 = row.get("id");
        sqlx::query(
            "UPDATE clipboard_items
             SET last_used_at = CURRENT_TIMESTAMP,
                 use_count    = use_count + 1,
                 metadata     = COALESCE(NULLIF(metadata, ''), ?1),
                 tags         = ?2
             WHERE id = ?3",
        )
        .bind(&metadata_json)
        .bind(&tags_json)
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
    pub is_private: bool,
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
                use_count, is_pinned, is_private, tags, metadata
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
            let is_private = row.try_get::<i64, _>("is_private").unwrap_or(0) != 0;
            let mut tags = parse_tags(row.try_get("tags").ok());
            if !is_private {
                tags = remove_privacy_tags(tags);
            }

            let content = if is_private {
                match content_type.as_str() {
                    "image" => "".to_string(),
                    "file" => "[已加密文件]".to_string(),
                    _ => "[已加密文本]".to_string(),
                }
            } else if content_type == "text" {
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
                is_private,
                tags,
                metadata: if is_private {
                    HashMap::new()
                } else {
                    parse_metadata(row.try_get("metadata").ok())
                },
            }
        })
        .collect();
    Ok(items)
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TextItemDetail {
    pub id: i64,
    pub content: String,
}

#[tauri::command]
pub async fn get_text_item(
    state: State<'_, AppState>,
    id: i64,
) -> Result<TextItemDetail, String> {
    let row = sqlx::query(
        "SELECT id, preview_text, is_private
         FROM clipboard_items
         WHERE id = ?1 AND content_type = 'text'
         LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("text item {} not found", id))?;

    if row.try_get::<i64, _>("is_private").unwrap_or(0) != 0 {
        return Err("该条目已加密，请先通过隐私密码解锁".to_string());
    }

    Ok(TextItemDetail {
        id: row.get("id"),
        content: row.try_get("preview_text").unwrap_or_default(),
    })
}

#[tauri::command]
pub async fn get_privacy_status(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<PrivacyStatus, String> {
    let cfg = load_privacy_config(&app)?;
    let private_items: i64 = sqlx::query_scalar("SELECT COUNT(1) FROM clipboard_items WHERE is_private = 1")
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);

    Ok(PrivacyStatus {
        password_set: has_password(&cfg),
        private_items,
        security_question_set: has_security_question(&cfg),
        security_question: if has_security_question(&cfg) {
            Some(cfg.security_question.clone())
        } else {
            None
        },
    })
}

#[tauri::command]
pub async fn set_privacy_password(
    app: AppHandle,
    state: State<'_, AppState>,
    current_password: Option<String>,
    new_password: String,
    security_question: String,
    security_answer: String,
) -> Result<(), String> {
    let old_cfg = load_privacy_config(&app)?;
    let mut new_cfg = old_cfg.clone();
    let private_rows = sqlx::query(
        "SELECT id, encrypted_content
         FROM clipboard_items
         WHERE is_private = 1
           AND encrypted_content IS NOT NULL
           AND encrypted_content <> ''",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?;
    let need_reencrypt = has_password(&old_cfg) && !private_rows.is_empty();

    set_password(
        &mut new_cfg,
        current_password.as_deref(),
        &new_password,
        &security_question,
        &security_answer,
    )?;

    if !need_reencrypt {
        return save_privacy_config(&app, &new_cfg);
    }

    let current = current_password
        .as_deref()
        .ok_or_else(|| "请输入当前隐私密码".to_string())?;

    let mut tx = state.pool.begin().await.map_err(|e| e.to_string())?;
    for row in private_rows {
        let id: i64 = row.get("id");
        let encrypted: String = row
            .try_get("encrypted_content")
            .map_err(|e| e.to_string())?;

        let plain = decrypt_content(&old_cfg, current, &encrypted)?;
        let reencrypted = encrypt_content(&new_cfg, &plain)?;

        sqlx::query(
            "UPDATE clipboard_items
             SET encrypted_content = ?1
             WHERE id = ?2 AND is_private = 1",
        )
        .bind(&reencrypted)
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    save_privacy_config(&app, &new_cfg)?;

    if let Err(e) = tx.commit().await {
        let _ = save_privacy_config(&app, &old_cfg);
        return Err(format!("更新隐私密码失败，已回滚配置: {}", e));
    }

    Ok(())
}

#[tauri::command]
pub async fn protect_item(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
) -> Result<(), String> {
    let cfg = load_privacy_config(&app)?;
    if !has_password(&cfg) || !has_security_question(&cfg) {
        return Err("请先在设置中配置隐私密码和安全问题后再启用隐私".to_string());
    }

    let row = sqlx::query(
        "SELECT content_type, preview_text, storage_path, tags, is_private
         FROM clipboard_items
         WHERE id = ?1
         LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("item {} not found", id))?;

    if row.try_get::<i64, _>("is_private").unwrap_or(0) != 0 {
        return Ok(());
    }

    let content_type: String = row.get("content_type");
    let plain = if content_type == "text" {
        row.try_get::<Option<String>, _>("preview_text")
            .ok()
            .flatten()
            .unwrap_or_default()
    } else {
        row.try_get::<Option<String>, _>("storage_path")
            .ok()
            .flatten()
            .unwrap_or_default()
    };

    if plain.is_empty() {
        return Err("该条目内容为空，无法加密".to_string());
    }

    let encrypted = encrypt_content(&cfg, &plain)?;
    let mut tags = parse_tags(row.try_get("tags").ok());
    if !tags.iter().any(|t| is_privacy_tag(t)) {
        tags.push(PRIVACY_TAG.to_string());
    }
    let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".into());

    sqlx::query(
        "UPDATE clipboard_items
         SET encrypted_content = ?1,
             is_private = 1,
             content_hash = NULL,
             preview_text = NULL,
             storage_path = NULL,
             metadata = '{}',
             tags = ?2,
             last_used_at = CURRENT_TIMESTAMP
         WHERE id = ?3",
    )
    .bind(&encrypted)
    .bind(&tags_json)
    .bind(id)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    emit_changed(&app).await;
    Ok(())
}

#[tauri::command]
pub async fn unprotect_item(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
    password: String,
) -> Result<(), String> {
    let cfg = load_privacy_config(&app)?;

    let row = sqlx::query(
        "SELECT content_type, encrypted_content, tags, is_private
         FROM clipboard_items
         WHERE id = ?1
         LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("item {} not found", id))?;

    if row.try_get::<i64, _>("is_private").unwrap_or(0) == 0 {
        return Ok(());
    }

    let encrypted = row
        .try_get::<Option<String>, _>("encrypted_content")
        .ok()
        .flatten()
        .ok_or_else(|| "私密数据损坏：缺少密文".to_string())?;

    let plain = decrypt_content(&cfg, &password, &encrypted)?;
    let content_type: String = row.get("content_type");
    let hash = compute_hash(&content_type, &plain);

    let tags = remove_privacy_tags(parse_tags(row.try_get("tags").ok()));
    let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".into());

    let (preview, storage) = if content_type == "text" {
        (Some(plain.as_str()), None)
    } else {
        (None, Some(plain.as_str()))
    };

    sqlx::query(
        "UPDATE clipboard_items
         SET encrypted_content = NULL,
             is_private = 0,
             content_hash = ?1,
             preview_text = ?2,
             storage_path = ?3,
             tags = ?4,
             last_used_at = CURRENT_TIMESTAMP
         WHERE id = ?5",
    )
    .bind(&hash)
    .bind(preview)
    .bind(storage)
    .bind(&tags_json)
    .bind(id)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    emit_changed(&app).await;
    Ok(())
}

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
    let mut seen = std::collections::HashSet::new();
    let cleaned: Vec<String> = tags
        .into_iter()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .filter(|t| seen.insert(t.clone()))
        .collect();

    let row = sqlx::query("SELECT is_private FROM clipboard_items WHERE id = ?1 LIMIT 1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("item {} not found", id))?;

    let is_private = row.try_get::<i64, _>("is_private").unwrap_or(0) != 0;
    let has_privacy_tag = cleaned.iter().any(|t| is_privacy_tag(t));
    if has_privacy_tag != is_private {
        return Err("隐私标签需通过隐私按钮进行变更".to_string());
    }

    let json = serde_json::to_string(&cleaned).unwrap_or_else(|_| "[]".into());

    sqlx::query("UPDATE clipboard_items SET tags = ?1 WHERE id = ?2")
        .bind(&json)
        .bind(id)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

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

#[tauri::command]
pub async fn update_text_item(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
    content: String,
) -> Result<(), String> {
    let normalized = content.trim().to_string();
    if normalized.is_empty() {
        return Err("content cannot be empty".to_string());
    }

    let hash = compute_hash("text", &normalized);
    let affected = sqlx::query(
        "UPDATE clipboard_items
         SET content_type = 'text',
             content_hash = ?1,
             preview_text = ?2,
             storage_path = NULL,
             encrypted_content = NULL,
             is_private = 0,
             last_used_at = CURRENT_TIMESTAMP
         WHERE id = ?3 AND (is_private IS NULL OR is_private = 0)",
    )
    .bind(&hash)
    .bind(&normalized)
    .bind(id)
    .execute(&state.pool)
    .await
    .map_err(|e| e.to_string())?
    .rows_affected();

    if affected == 0 {
        return Err(format!("item {} not found or is private", id));
    }

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
            let res = files
                .into_iter()
                .map(|path| {
                    let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                    FileMetadata { path, size }
                })
                .collect();
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
    #[serde(default = "default_bool_false")]
    pub always_on_top: bool,
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
    #[serde(default = "default_device_name")]
    pub device_name: String,
}

fn default_auto_paste() -> bool {
    true
}
fn default_keep_window_open() -> bool {
    false
}
fn default_bool_false() -> bool {
    false
}
fn default_string() -> String {
    "".to_string()
}
fn default_page_size() -> u32 {
    50
}
fn default_history_limit() -> u32 {
    5000
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigResponse {
    pub cache_path: String,
    pub shortcut: String,
    pub default_dir: String,
    pub effective_dir: String,
    pub auto_paste: bool,
    pub keep_window_open: bool,
    pub always_on_top: bool,
    pub page_size: u32,
    pub history_limit: u32,
    pub webdav_url: String,
    pub webdav_username: String,
    pub webdav_password: String,
    pub webdav_sync_enabled: bool,
    pub device_name: String,
}

#[tauri::command]
pub async fn get_config(app: AppHandle) -> Result<ConfigResponse, String> {
    let app_data = app.path().app_data_dir().unwrap();
    let conf = read_app_config(&app);

    let default_dir = app_data.to_string_lossy().to_string();
    let effective_dir = if conf.cache_path.is_empty() {
        default_dir.clone()
    } else {
        conf.cache_path.clone()
    };

    Ok(ConfigResponse {
        cache_path: conf.cache_path,
        shortcut: conf.shortcut,
        default_dir,
        effective_dir,
        auto_paste: conf.auto_paste,
        keep_window_open: conf.keep_window_open,
        always_on_top: conf.always_on_top,
        page_size: conf.page_size,
        history_limit: conf.history_limit,
        webdav_url: conf.webdav_url,
        webdav_username: conf.webdav_username,
        webdav_password: conf.webdav_password,
        webdav_sync_enabled: conf.webdav_sync_enabled,
        device_name: sanitize_device_name(conf.device_name),
    })
}

#[tauri::command]
pub async fn set_config(app: AppHandle, mut config: AppConfig) -> Result<(), String> {
    config.device_name = sanitize_device_name(config.device_name);
    let conf_path = app.path().app_data_dir().unwrap().join("config.json");
    let data = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    std::fs::write(&conf_path, data).map_err(|e| e.to_string())?;
    Ok(())
}
