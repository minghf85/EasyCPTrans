use crate::commands::AppConfig;
use crate::db::compute_hash;
use crate::db::AppState;
use regex::Regex;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::collections::HashSet;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

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

fn parse_config(app: &AppHandle) -> Result<AppConfig, String> {
    let app_data = app.path().app_data_dir().unwrap();
    let conf_path = app_data.join("config.json");
    let conf_data = match std::fs::read_to_string(&conf_path) {
        Ok(data) => data,
        Err(_) => {
            return Ok(AppConfig {
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
                device_name: "This Device".to_string(),
                managed_tags: Vec::new(),
                window_width: None,
                window_height: None,
                window_x: None,
                window_y: None,
            })
        }
    };
    serde_json::from_str(&conf_data).map_err(|e| format!("Parse config failed: {}", e))
}

fn build_item_url(base_url: &str, filename: &str) -> String {
    format!("{}/{}", base_url.trim_end_matches('/'), filename)
}

fn parse_propfind_hrefs(body: &str) -> Vec<String> {
    let re = Regex::new(r"(?is)<(?:[a-z0-9]+:)?href>([^<]+)</(?:[a-z0-9]+:)?href>")
        .expect("invalid href regex");
    re.captures_iter(body)
        .filter_map(|c| c.get(1).map(|m| m.as_str().trim().to_string()))
        .collect()
}

fn href_to_filename(href: &str) -> Option<String> {
    let cleaned = href
        .split('?')
        .next()
        .unwrap_or(href)
        .trim_end_matches('/')
        .to_string();
    let name = cleaned.rsplit('/').next()?.trim();
    if name.ends_with(".json") && name.len() > ".json".len() {
        Some(name.to_string())
    } else {
        None
    }
}

fn merge_tags(local_tags_raw: Option<String>, remote_tags: &[String]) -> Vec<String> {
    let mut merged: Vec<String> = parse_tags(local_tags_raw);
    let mut seen: HashSet<String> = merged.iter().map(|s| s.to_lowercase()).collect();
    for tag in remote_tags {
        let trimmed = tag.trim();
        if trimmed.is_empty() {
            continue;
        }
        let key = trimmed.to_lowercase();
        if seen.insert(key) {
            merged.push(trimmed.to_string());
        }
    }
    merged
}

async fn list_remote_json_files(
    client: &Client,
    base_url: &str,
    username: &str,
    password: &str,
) -> Result<Vec<String>, String> {
    let res = client
        .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), base_url)
        .header("Depth", "1")
        .basic_auth(username, Some(password))
        .send()
        .await
        .map_err(|e| format!("PROPFIND {} failed: {}", base_url, e))?;

    let status = res.status();
    if !(status.is_success() || status == reqwest::StatusCode::MULTI_STATUS) {
        let body = res.text().await.unwrap_or_default();
        let snippet: String = body.chars().take(200).collect();
        return Err(format!(
            "PROPFIND {} returned {}: {}",
            base_url,
            status,
            snippet.trim()
        ));
    }

    let body = res
        .text()
        .await
        .map_err(|e| format!("Read PROPFIND body failed: {}", e))?;
    let mut names: Vec<String> = parse_propfind_hrefs(&body)
        .into_iter()
        .filter_map(|h| href_to_filename(&h))
        .collect();
    names.sort();
    names.dedup();
    Ok(names)
}

async fn download_item(
    client: &Client,
    item_url: &str,
    username: &str,
    password: &str,
) -> Result<SyncItem, String> {
    let res = client
        .get(item_url)
        .basic_auth(username, Some(password))
        .send()
        .await
        .map_err(|e| format!("GET {} failed: {}", item_url, e))?;
    if !res.status().is_success() {
        return Err(format!("GET {} returned {}", item_url, res.status()));
    }
    let raw = res
        .text()
        .await
        .map_err(|e| format!("Read {} body failed: {}", item_url, e))?;
    serde_json::from_str::<SyncItem>(&raw)
        .map_err(|e| format!("Parse {} JSON failed: {}", item_url, e))
}

async fn upsert_remote_item(pool: &sqlx::SqlitePool, item: &SyncItem) -> Result<bool, String> {
    if item.content_hash.trim().is_empty() {
        return Ok(false);
    }
    if item.content_type.trim().is_empty() {
        return Ok(false);
    }

    let incoming_content = if item.content_type == "text" {
        item.preview_text
            .as_ref()
            .or(item.raw_content.as_ref())
            .map(|s| s.trim().to_string())
            .unwrap_or_default()
    } else {
        item.raw_content.clone().unwrap_or_default()
    };

    if incoming_content.is_empty() {
        return Ok(false);
    }

    let expected_hash = compute_hash(&item.content_type, &incoming_content);
    if expected_hash != item.content_hash {
        return Ok(false);
    }

    let existing = sqlx::query(
        "SELECT id, tags, is_pinned, use_count, last_used_at
         FROM clipboard_items
         WHERE content_hash = ?1 AND (is_private IS NULL OR is_private = 0)
         LIMIT 1",
    )
    .bind(&item.content_hash)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Load local existing item failed: {}", e))?;

    if let Some(row) = existing {
        let id: i64 = row.get("id");
        let merged_tags = merge_tags(row.try_get("tags").ok(), &item.tags);
        let tags_json = serde_json::to_string(&merged_tags).unwrap_or_else(|_| "[]".into());
        let local_pinned = row.try_get::<i64, _>("is_pinned").unwrap_or(0) != 0;
        let merged_pinned = local_pinned || item.is_pinned;
        let local_use_count = row.try_get::<i64, _>("use_count").unwrap_or(0);
        let merged_use_count = local_use_count.max(item.use_count);
        let local_last_used: Option<String> = row.try_get("last_used_at").ok();
        let remote_last_used = item.last_used_at.clone();
        let merged_last_used = match (local_last_used, remote_last_used) {
            (Some(l), Some(r)) => Some(if l >= r { l } else { r }),
            (Some(l), None) => Some(l),
            (None, Some(r)) => Some(r),
            (None, None) => None,
        };

        sqlx::query(
            "UPDATE clipboard_items
             SET tags = ?1,
                 is_pinned = ?2,
                 use_count = ?3,
                 last_used_at = COALESCE(?4, last_used_at)
             WHERE id = ?5",
        )
        .bind(&tags_json)
        .bind(if merged_pinned { 1 } else { 0 })
        .bind(merged_use_count)
        .bind(merged_last_used)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| format!("Update local item {} failed: {}", id, e))?;
        return Ok(false);
    }

    let tags_json = serde_json::to_string(&item.tags).unwrap_or_else(|_| "[]".into());
    let (preview_text, storage_path) = if item.content_type == "text" {
        (Some(incoming_content), None)
    } else {
        (None, Some(incoming_content))
    };

    sqlx::query(
        "INSERT INTO clipboard_items
            (content_type, content_hash, preview_text, storage_path, tags, is_pinned, use_count, created_at, last_used_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, COALESCE(?8, CURRENT_TIMESTAMP), COALESCE(?9, CURRENT_TIMESTAMP))",
    )
    .bind(&item.content_type)
    .bind(&item.content_hash)
    .bind(preview_text)
    .bind(storage_path)
    .bind(&tags_json)
    .bind(if item.is_pinned { 1 } else { 0 })
    .bind(item.use_count.max(1))
    .bind(item.created_at.clone())
    .bind(item.last_used_at.clone())
    .execute(pool)
    .await
    .map_err(|e| format!("Insert remote item failed: {}", e))?;
    Ok(true)
}

async fn pull_remote(
    app: &AppHandle,
    client: &Client,
    config: &AppConfig,
) -> Result<(usize, usize), String> {
    let base_url = config.webdav_url.trim_end_matches('/');
    let files = list_remote_json_files(
        client,
        base_url,
        &config.webdav_username,
        &config.webdav_password,
    )
    .await?;

    let pool = app.state::<AppState>().pool.clone();
    let mut inserted = 0usize;
    let mut merged = 0usize;
    for file in files {
        let item_url = build_item_url(base_url, &file);
        let item = match download_item(
            client,
            &item_url,
            &config.webdav_username,
            &config.webdav_password,
        )
        .await
        {
            Ok(v) => v,
            Err(err) => {
                eprintln!("Skip remote item {}: {}", file, err);
                continue;
            }
        };

        let is_new = upsert_remote_item(&pool, &item).await?;
        if is_new {
            inserted += 1;
        } else {
            merged += 1;
        }
    }

    Ok((inserted, merged))
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
    let config = parse_config(&app)?;

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
    let (downloaded, merged) = pull_remote(&app, &client, &config).await?;

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

        let item_url = build_item_url(base_url, &format!("{}.json", content_hash));
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
        "WebDAV sync completed successfully. downloaded(new): {}, merged(existing): {}, uploaded: {}",
        downloaded, merged, uploaded
    );
    if downloaded > 0 || merged > 0 {
        let _ = app.emit("clipboard-changed", ());
    }
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
