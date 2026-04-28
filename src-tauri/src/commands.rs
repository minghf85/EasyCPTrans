use crate::db::{compute_hash, AppState};
use crate::pipeline::{ClipboardItem, Pipeline, PipelineOutcome};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, State};

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
    let raw = ClipboardItem {
        content_type: payload.content_type,
        content: payload.content,
        source_app: payload.source_app,
        metadata: HashMap::new(),
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
    let limit = limit.unwrap_or(100).clamp(1, 1000);
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
