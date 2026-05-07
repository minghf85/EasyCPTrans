use crate::commands::AppConfig;
use crate::db::AppState;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::time::Duration;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Debug)]
pub struct SyncItem {
    pub content_hash: String,
    pub content_type: String,
    pub preview_text: Option<String>,
    pub tags: Vec<String>,
    pub is_pinned: bool,
    pub raw_content: Option<String>,
    pub created_at: Option<String>,
    pub last_used_at: Option<String>,
    pub use_count: i64,
}

fn parse_tags(raw: Option<String>) -> Vec<String> {
    raw.and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

async fn upload_item(
    client: &Client,
    url: &str,
    username: &str,
    password: &str,
    item: &SyncItem,
) -> Result<(), String> {
    let body = serde_json::to_vec(item).map_err(|e| format!("Serialize sync item failed: {}", e))?;
    let res = client
        .put(url)
        .header("Content-Type", "application/json; charset=utf-8")
        .basic_auth(username, Some(password))
        .body(body)
        .send()
        .await
        .map_err(|e| format!("PUT {} failed: {}", url, e))?;

    let status = res.status();
    if status.is_success() {
        return Ok(());
    }

    let body = res.text().await.unwrap_or_default();
    let snippet: String = body.chars().take(200).collect();
    Err(format!(
        "PUT {} returned {}: {}",
        url,
        status,
        snippet.trim()
    ))
}

pub async fn run_sync(app: AppHandle) -> Result<(), String> {
    // 1. Get config
    let app_data = app.path().app_data_dir().unwrap();
    let conf_path = app_data.join("config.json");
    let conf_data = std::fs::read_to_string(&conf_path)
        .map_err(|e| format!("Read config failed: {}", e))?;
    let config: AppConfig = serde_json::from_str(&conf_data)
        .map_err(|e| format!("Parse config failed: {}", e))?;

    if !config.webdav_sync_enabled || config.webdav_url.is_empty() {
        return Ok(());
    }
    if config.webdav_username.is_empty() {
        return Err("WebDAV username is empty".into());
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let base_url = config.webdav_url.trim_end_matches('/');

    let pool = app.state::<AppState>().pool.clone();
    let rows = sqlx::query(
        "SELECT content_hash, content_type, preview_text, storage_path, tags, is_pinned, created_at, last_used_at, use_count
         FROM clipboard_items
         WHERE content_hash IS NOT NULL AND content_hash <> ''",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Load local clipboard data failed: {}", e))?;

    let mut uploaded = 0usize;
    for row in rows {
        let content_hash: String = row
            .try_get("content_hash")
            .map_err(|e| format!("Read content_hash failed: {}", e))?;
        let content_type: String = row
            .try_get("content_type")
            .map_err(|e| format!("Read content_type failed: {}", e))?;
        let preview_text: Option<String> = row.try_get("preview_text").ok();
        let storage_path: Option<String> = row.try_get("storage_path").ok();
        let tags_raw: Option<String> = row.try_get("tags").ok();
        let is_pinned = row.try_get::<i64, _>("is_pinned").unwrap_or(0) != 0;
        let created_at: Option<String> = row.try_get("created_at").ok();
        let last_used_at: Option<String> = row.try_get("last_used_at").ok();
        let use_count: i64 = row.try_get("use_count").unwrap_or(0);

        let raw_content = if content_type == "text" {
            preview_text.clone()
        } else {
            storage_path
        };

        let item = SyncItem {
            content_hash: content_hash.clone(),
            content_type,
            preview_text,
            tags: parse_tags(tags_raw),
            is_pinned,
            raw_content,
            created_at,
            last_used_at,
            use_count,
        };

        let item_url = format!("{}/{}.json", base_url, content_hash);
        upload_item(
            &client,
            &item_url,
            &config.webdav_username,
            &config.webdav_password,
            &item,
        )
        .await?;
        uploaded += 1;
    }

    println!(
        "WebDAV sync completed successfully. Uploaded {} item(s).",
        uploaded
    );
    Ok(())
}

#[tauri::command]
pub async fn trigger_sync(app: AppHandle) -> Result<(), String> {
    run_sync(app).await
}

#[tauri::command]
pub async fn verify_webdav(
    url: String,
    username: String,
    password: Option<String>,
) -> Result<bool, String> {
    if url.is_empty() {
        return Err("URL cannot be empty".into());
    }
    
    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let base_url = url.trim_end_matches('/');
    let res = client.request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), base_url)
        .header("Depth", "0")
        .basic_auth(&username, password.as_deref())
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;
        
    if res.status().is_success() || res.status() == reqwest::StatusCode::MULTI_STATUS {
        Ok(true)
    } else {
        Err(format!("Authentication or Server Error: {}", res.status()))
    }
}
