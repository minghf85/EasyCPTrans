use crate::commands::{parse_metadata, HistoryItem};
use crate::db::AppState;
use regex::Regex;
use sqlx::Row;
use std::collections::HashSet;
use tauri::{AppHandle, State};

fn token_set(value: &str) -> HashSet<String> {
    value
        .to_ascii_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .map(|s| s.to_string())
        .filter(|s| s.len() >= 3)
        .collect()
}

fn token_overlap_score(a: &HashSet<String>, b: &HashSet<String>) -> f64 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let intersection: HashSet<&String> = a.intersection(b).collect();
    let union_len = a.len() + b.len() - intersection.len();
    intersection.len() as f64 / union_len.max(1) as f64
}

fn hours_since(value: &str) -> f64 {
    let parsed = chrono::DateTime::parse_from_rfc3339(value)
        .or_else(|_| chrono::DateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S%.f%:z"))
        .ok();
    if let Some(dt) = parsed {
        let now = chrono::Utc::now();
        let duration = now - dt.with_timezone(&chrono::Utc);
        return duration.num_seconds() as f64 / 3600.0;
    }
    168.0
}

fn source_app_matches(item: &HistoryItem, active_window: &str) -> bool {
    let window_lower = active_window.to_ascii_lowercase();
    item.metadata
        .get("sourceApp")
        .map(|values| {
            values.iter().any(|app| {
                let app_lower = app.to_ascii_lowercase();
                window_lower.contains(&app_lower) || app_lower.contains(&window_lower)
            })
        })
        .unwrap_or(false)
}

fn collect_text_tokens(item: &HistoryItem) -> HashSet<String> {
    let mut tokens = token_set(&item.content);
    for tag in &item.tags {
        tokens.extend(token_set(tag));
    }
    for values in item.metadata.values() {
        for value in values {
            tokens.extend(token_set(value));
        }
    }
    tokens
}

fn score_item(
    item: &HistoryItem,
    active_window: Option<&str>,
    current_tokens: &HashSet<String>,
    command_tokens: &HashSet<String>,
) -> f64 {
    let mut score = 0.0;

    if item.pinned {
        score += 100.0;
    }

    score += (item.use_count as f64) * 5.0;

    let last_used = item.last_used_at.as_deref().or(item.created_at.as_deref());
    if let Some(ts) = last_used {
        let hours = hours_since(ts).max(0.0);
        score += 40.0 * (-hours / 48.0).exp();
    }

    if let Some(window) = active_window {
        if !window.is_empty() && source_app_matches(item, window) {
            score += 50.0;
        }
    }

    if !current_tokens.is_empty() {
        let item_tokens = collect_text_tokens(item);
        let overlap = token_overlap_score(current_tokens, &item_tokens);
        score += overlap * 80.0;

        if !command_tokens.is_empty() {
            let overlap = token_overlap_score(command_tokens, &item_tokens);
            score += overlap * 60.0;
        }
    }

    score
}

pub async fn build_recommendations(
    state: &AppState,
    active_window: Option<String>,
    current_text: Option<String>,
    limit: usize,
) -> Result<Vec<HistoryItem>, String> {
    let rows = sqlx::query(
        "SELECT id, content_type, preview_text, storage_path, created_at, last_used_at,
                use_count, is_pinned, is_private, tags, metadata
         FROM clipboard_items
         WHERE (is_private IS NULL OR is_private = 0)
         ORDER BY is_pinned DESC, last_used_at DESC
         LIMIT 500",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    let current_tokens: HashSet<String> = current_text
        .as_deref()
        .map(token_set)
        .unwrap_or_default();

    let command_tokens: HashSet<String> = current_text
        .as_deref()
        .map(|text| {
            let re = Regex::new(r"[A-Za-z_][A-Za-z0-9_\-./]*").unwrap();
            re.find_iter(text)
                .map(|m| m.as_str().to_ascii_lowercase())
                .filter(|s| s.len() >= 3)
                .collect()
        })
        .unwrap_or_default();

    let mut scored: Vec<(HistoryItem, f64)> = rows
        .into_iter()
        .filter_map(|row| {
            let content_type: String = row.get("content_type");
            let preview: Option<String> = row.try_get("preview_text").ok();
            let storage: Option<String> = row.try_get("storage_path").ok();
            let is_private = row.try_get::<i64, _>("is_private").unwrap_or(0) != 0;
            if is_private {
                return None;
            }

            let content = if content_type == "text" {
                preview.unwrap_or_default()
            } else if content_type == "image" {
                String::new()
            } else {
                storage.unwrap_or_default()
            };

            let tags: Vec<String> = serde_json::from_str(
                &row.try_get::<String, _>("tags").unwrap_or_else(|_| "[]".into()),
            )
            .unwrap_or_default();

            let metadata = parse_metadata(row.try_get("metadata").ok());

            let item = HistoryItem {
                id: row.get("id"),
                content_type,
                content,
                created_at: row.try_get("created_at").ok(),
                last_used_at: row.try_get("last_used_at").ok(),
                use_count: row.try_get("use_count").unwrap_or(0),
                pinned: row.try_get::<i64, _>("is_pinned").unwrap_or(0) != 0,
                is_private,
                tags,
                metadata,
            };

            let score = score_item(
                &item,
                active_window.as_deref(),
                &current_tokens,
                &command_tokens,
            );
            Some((item, score))
        })
        .collect();

    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    Ok(scored.into_iter().map(|(item, _)| item).take(limit).collect())
}

#[tauri::command]
pub async fn get_recommendations(
    app: AppHandle,
    state: State<'_, AppState>,
    active_window: Option<String>,
    current_text: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<HistoryItem>, String> {
    let window = active_window
        .filter(|w| !w.is_empty())
        .or_else(|| get_active_window_blocking(&app).ok());

    let text = current_text.filter(|t| !t.is_empty());

    build_recommendations(
        &state,
        window,
        text,
        limit.unwrap_or(5).clamp(1, 20),
    )
    .await
}

fn get_active_window_blocking(_app: &AppHandle) -> Result<String, String> {
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
