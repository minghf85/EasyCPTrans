use sha2::{Digest, Sha256};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};
use std::path::Path;

pub struct AppState {
    pub pool: SqlitePool,
}

pub fn compute_hash(content_type: &str, content: &str) -> String {
    let normalized: &str = if content_type == "text" {
        content.trim()
    } else {
        content
    };
    let mut h = Sha256::new();
    h.update(content_type.as_bytes());
    h.update(b"\0");
    h.update(normalized.as_bytes());
    hex::encode(h.finalize())
}

pub async fn open_pool(db_path: &Path) -> Result<SqlitePool, sqlx::Error> {
    let opts = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .busy_timeout(std::time::Duration::from_secs(5));

    SqlitePoolOptions::new()
        .max_connections(4)
        .connect_with(opts)
        .await
}

pub async fn ensure_schema(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS clipboard_items (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            content_type      TEXT NOT NULL,
            content_hash      TEXT,
            storage_path      TEXT,
            preview_text      TEXT,
            encrypted_content TEXT,
            is_private        BOOLEAN DEFAULT FALSE,
            created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_used_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            use_count         INTEGER DEFAULT 0,
            is_pinned         BOOLEAN DEFAULT FALSE,
            tags              TEXT,
            metadata          TEXT
        )",
    )
    .execute(pool)
    .await?;

    let _ = sqlx::query("ALTER TABLE clipboard_items ADD COLUMN metadata TEXT")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE clipboard_items ADD COLUMN encrypted_content TEXT")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE clipboard_items ADD COLUMN is_private BOOLEAN DEFAULT FALSE")
        .execute(pool)
        .await;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_clipboard_items_content_hash
         ON clipboard_items(content_hash)",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_clipboard_items_pinned_last_used
         ON clipboard_items(is_pinned DESC, last_used_at DESC)",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_clipboard_items_pinned_id
         ON clipboard_items(is_pinned DESC, id DESC)",
    )
    .execute(pool)
    .await?;

    backfill_hashes(pool).await?;

    Ok(())
}

async fn backfill_hashes(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let rows = sqlx::query(
        "SELECT id, content_type,
                COALESCE(preview_text, storage_path, '') AS content
         FROM clipboard_items
         WHERE (content_hash IS NULL OR content_hash = '')
           AND (is_private IS NULL OR is_private = 0)",
    )
    .fetch_all(pool)
    .await?;

    for row in rows {
        let id: i64 = row.get("id");
        let content_type: String = row.get("content_type");
        let content: String = row.try_get("content").unwrap_or_default();
        if content.is_empty() {
            continue;
        }
        let hash = compute_hash(&content_type, &content);
        sqlx::query("UPDATE clipboard_items SET content_hash = ?1 WHERE id = ?2")
            .bind(&hash)
            .bind(id)
            .execute(pool)
            .await?;
    }
    Ok(())
}
