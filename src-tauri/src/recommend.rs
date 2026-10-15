use crate::commands::{parse_metadata, HistoryItem};
use crate::db::AppState;
use serde::Serialize;
use sqlx::Row;
use std::collections::{HashMap, HashSet};
use tauri::{AppHandle, State};

/// How many recent items to consider as candidates.
const CANDIDATE_LIMIT: i64 = 400;
/// Jaccard overlap above which two items count as "about the same thing".
const SIMILARITY_THRESHOLD: f64 = 0.12;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Recommendation {
    pub item: HistoryItem,
    /// Why this item is being suggested: `sequence`, `similar`, `app`, `frequent`.
    pub reason: String,
    pub score: f64,
}

fn token_set(value: &str) -> HashSet<String> {
    value
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .map(|s| s.to_string())
        .filter(|s| s.len() >= 3)
        .collect()
}

fn token_overlap_score(a: &HashSet<String>, b: &HashSet<String>) -> f64 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let intersection = a.intersection(b).count();
    let union_len = a.len() + b.len() - intersection;
    intersection as f64 / union_len.max(1) as f64
}

fn hours_since(value: &str) -> f64 {
    let parsed = chrono::DateTime::parse_from_rfc3339(value)
        .or_else(|_| chrono::DateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S%.f%:z"))
        .ok();
    match parsed {
        Some(dt) => {
            let duration = chrono::Utc::now() - dt.with_timezone(&chrono::Utc);
            (duration.num_seconds() as f64 / 3600.0).max(0.0)
        }
        None => 168.0,
    }
}

fn source_app(item: &HistoryItem) -> Option<String> {
    item.metadata
        .get("sourceApp")
        .and_then(|values| values.first())
        .map(|value| value.to_lowercase())
}

fn same_app(a: &HistoryItem, b: &HistoryItem) -> bool {
    match (source_app(a), source_app(b)) {
        (Some(left), Some(right)) => !left.is_empty() && left == right,
        _ => false,
    }
}

fn app_matches_window(item: &HistoryItem, active_window: &str) -> bool {
    let window_lower = active_window.to_lowercase();
    if window_lower.is_empty() {
        return false;
    }
    source_app(item)
        .map(|app| window_lower.contains(&app) || app.contains(&window_lower))
        .unwrap_or(false)
}

/// The item the user touched last — freshly copied or pasted. Recommendations
/// hang off this: "last time you had this, you went on to use that".
async fn resolve_seed(state: &AppState) -> Option<HistoryItem> {
    let tracked = state
        .last_item_id
        .load(std::sync::atomic::Ordering::Relaxed);

    let row = if tracked > 0 {
        sqlx::query(
            "SELECT id, content_type, preview_text, storage_path, created_at, last_used_at,
                    use_count, is_pinned, is_private, tags, metadata
             FROM clipboard_items
             WHERE id = ?1 AND (is_private IS NULL OR is_private = 0)",
        )
        .bind(tracked)
        .fetch_optional(&state.pool)
        .await
        .ok()
        .flatten()
    } else {
        None
    };

    let row = match row {
        Some(row) => Some(row),
        None => sqlx::query(
            "SELECT id, content_type, preview_text, storage_path, created_at, last_used_at,
                    use_count, is_pinned, is_private, tags, metadata
             FROM clipboard_items
             WHERE (is_private IS NULL OR is_private = 0)
             ORDER BY COALESCE(last_used_at, created_at) DESC
             LIMIT 1",
        )
        .fetch_optional(&state.pool)
        .await
        .ok()
        .flatten(),
    }?;

    row_to_item(&row)
}

fn row_to_item(row: &sqlx::sqlite::SqliteRow) -> Option<HistoryItem> {
    let content_type: String = row.try_get("content_type").ok()?;
    let is_private = row.try_get::<i64, _>("is_private").unwrap_or(0) != 0;
    if is_private {
        return None;
    }

    // Image payloads stay in the database and are fetched on demand, so the
    // recommendation payload carries no bytes for them.
    let content = if content_type == "text" {
        row.try_get::<Option<String>, _>("preview_text")
            .ok()
            .flatten()
            .unwrap_or_default()
    } else if content_type == "image" {
        String::new()
    } else {
        row.try_get::<Option<String>, _>("storage_path")
            .ok()
            .flatten()
            .unwrap_or_default()
    };

    Some(HistoryItem {
        id: row.get("id"),
        content_type,
        content,
        created_at: row.try_get("created_at").ok(),
        last_used_at: row.try_get("last_used_at").ok(),
        use_count: row.try_get("use_count").unwrap_or(0),
        pinned: row.try_get::<i64, _>("is_pinned").unwrap_or(0) != 0,
        is_private,
        tags: serde_json::from_str(
            &row.try_get::<String, _>("tags").unwrap_or_else(|_| "[]".into()),
        )
        .unwrap_or_default(),
        metadata: parse_metadata(row.try_get("metadata").ok()),
    })
}

async fn transition_counts(state: &AppState, seed_id: i64) -> HashMap<i64, i64> {
    let rows = sqlx::query("SELECT to_id, count FROM item_transitions WHERE from_id = ?1")
        .bind(seed_id)
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default();

    rows.into_iter()
        .map(|row| {
            (
                row.try_get::<i64, _>("to_id").unwrap_or(0),
                row.try_get::<i64, _>("count").unwrap_or(0),
            )
        })
        .collect()
}

async fn load_candidates(state: &AppState, exclude_id: i64) -> Result<Vec<HistoryItem>, String> {
    let rows = sqlx::query(
        "SELECT id, content_type, preview_text, storage_path, created_at, last_used_at,
                use_count, is_pinned, is_private, tags, metadata
         FROM clipboard_items
         WHERE (is_private IS NULL OR is_private = 0) AND id != ?1
         ORDER BY COALESCE(last_used_at, created_at) DESC
         LIMIT ?2",
    )
    .bind(exclude_id)
    .bind(CANDIDATE_LIMIT)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.iter().filter_map(row_to_item).collect())
}

/// Scores one candidate against the seed. The dominant signal decides the
/// reason shown on the card, so the user can see why it was suggested.
fn score_candidate(
    candidate: &HistoryItem,
    seed: &HistoryItem,
    seed_tokens: &HashSet<String>,
    followed_by: i64,
    active_window: Option<&str>,
) -> (f64, &'static str) {
    let mut score = 0.0;
    let mut reason = "frequent";

    if followed_by > 0 {
        score += 60.0 + (followed_by.min(5) as f64 - 1.0) * 10.0;
        reason = "sequence";
    }

    let overlap = token_overlap_score(seed_tokens, &token_set(&candidate.content));
    if overlap > 0.0 {
        score += overlap * 45.0;
        if reason != "sequence" && overlap >= SIMILARITY_THRESHOLD {
            reason = "similar";
        }
    }

    if same_app(candidate, seed) {
        score += 10.0;
    }

    if let Some(window) = active_window {
        if app_matches_window(candidate, window) {
            score += 8.0;
            if reason == "frequent" {
                reason = "app";
            }
        }
    }

    // Tie-breakers: things the user reaches for often, and recently.
    score += (candidate.use_count as f64).min(10.0) * 1.5;
    let last_touch = candidate
        .last_used_at
        .as_deref()
        .or(candidate.created_at.as_deref());
    if let Some(ts) = last_touch {
        score += 12.0 * (-hours_since(ts) / 72.0).exp();
    }

    (score, reason)
}

pub async fn build_recommendations(
    state: &AppState,
    active_window: Option<String>,
    limit: usize,
) -> Result<Vec<Recommendation>, String> {
    let Some(seed) = resolve_seed(state).await else {
        return Ok(Vec::new());
    };

    let followed_by = transition_counts(state, seed.id).await;
    let candidates = load_candidates(state, seed.id).await?;
    let seed_tokens = token_set(&seed.content);
    let window = active_window.as_deref().filter(|value| !value.is_empty());

    let mut scored: Vec<(Recommendation, i64)> = candidates
        .into_iter()
        .map(|item| {
            let follow_count = followed_by.get(&item.id).copied().unwrap_or(0);
            let (score, reason) =
                score_candidate(&item, &seed, &seed_tokens, follow_count, window);
            (
                Recommendation {
                    item,
                    reason: reason.to_string(),
                    score,
                },
                follow_count,
            )
        })
        .collect();

    scored.sort_by(|a, b| {
        b.0.score
            .partial_cmp(&a.0.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(scored
        .into_iter()
        .take(limit)
        .map(|(recommendation, _)| recommendation)
        .collect())
}

#[tauri::command]
pub async fn get_recommendations(
    app: AppHandle,
    state: State<'_, AppState>,
    active_window: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<Recommendation>, String> {
    let window = active_window
        .filter(|w| !w.is_empty())
        .or_else(|| get_active_window_blocking(&app).ok());

    build_recommendations(&state, window, limit.unwrap_or(5).clamp(1, 20)).await
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

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: i64, content: &str, tags: &[&str]) -> HistoryItem {
        HistoryItem {
            id,
            content_type: "text".to_string(),
            content: content.to_string(),
            created_at: None,
            last_used_at: None,
            use_count: 0,
            pinned: false,
            is_private: false,
            tags: tags.iter().map(|tag| tag.to_string()).collect(),
            metadata: HashMap::new(),
        }
    }

    #[test]
    fn sequence_signal_outweighs_a_passive_match() {
        let seed = item(1, "npm install express", &[]);
        let seed_tokens = token_set(&seed.content);

        let (followed, followed_reason) =
            score_candidate(&item(2, "npm run dev", &[]), &seed, &seed_tokens, 3, None);
        let (unrelated, unrelated_reason) =
            score_candidate(&item(3, "lunch at noon", &[]), &seed, &seed_tokens, 0, None);

        assert_eq!(followed_reason, "sequence");
        assert!(followed > unrelated);
        assert_ne!(unrelated_reason, "sequence");
    }

    #[test]
    fn overlapping_content_is_reported_as_similar() {
        let seed = item(1, "docker compose up the whole stack", &[]);
        let seed_tokens = token_set(&seed.content);

        let (score, reason) = score_candidate(
            &item(2, "docker compose down the stack", &[]),
            &seed,
            &seed_tokens,
            0,
            None,
        );

        assert_eq!(reason, "similar");
        assert!(score > 0.0);
    }

    #[test]
    fn tokens_ignore_short_and_non_alphanumeric_noise() {
        let tokens = token_set("git commit -m 'fix: the a11y bug'");
        assert!(tokens.contains("git"));
        assert!(tokens.contains("commit"));
        assert!(tokens.contains("a11y"));
        assert!(!tokens.contains("m"));
        assert!(!tokens.contains("-"));
    }
}
