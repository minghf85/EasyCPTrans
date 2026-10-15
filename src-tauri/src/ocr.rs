use crate::commands::{emit_changed, parse_metadata};
use crate::db::AppState;
use base64::Engine as _;
use sqlx::Row;
use std::sync::Once;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use windows::{
    core::Interface,
    Graphics::Imaging::BitmapDecoder,
    Media::Ocr::OcrEngine,
    Storage::Streams::{DataWriter, InMemoryRandomAccessStream},
    Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED},
};
use windows_future::{AsyncStatus, IAsyncInfo, IAsyncOperation};

static WINRT_INIT: Once = Once::new();

fn ensure_winrt_mta() {
    WINRT_INIT.call_once(|| unsafe {
        let _ = RoInitialize(RO_INIT_MULTITHREADED);
    });
}

fn data_url_to_bytes(data_url: &str) -> Result<Vec<u8>, String> {
    let parts: Vec<&str> = data_url.splitn(2, ',').collect();
    if parts.len() != 2 {
        return Err("Invalid image data URL".to_string());
    }
    let header = parts[0];
    if !header.starts_with("data:image/") || !header.contains("base64") {
        return Err("Image data URL must be base64 encoded".to_string());
    }
    base64::engine::general_purpose::STANDARD
        .decode(parts[1].replace("\n", "").replace("\r", ""))
        .map_err(|e| format!("Base64 decode failed: {}", e))
}

fn block_on_async<T: windows::core::RuntimeType + 'static>(
    op: &IAsyncOperation<T>,
) -> windows::core::Result<T> {
    let info: IAsyncInfo = op.cast()?;
    while info.Status()? != AsyncStatus::Completed {
        std::thread::sleep(Duration::from_millis(5));
    }
    op.GetResults()
}

fn run_ocr(data_url: &str) -> Result<String, String> {
    ensure_winrt_mta();

    let bytes = data_url_to_bytes(data_url)?;
    if bytes.is_empty() {
        return Err("Image is empty".to_string());
    }

    let stream = InMemoryRandomAccessStream::new()
        .map_err(|e| format!("Stream create failed: {}", e))?;
    let writer = DataWriter::CreateDataWriter(&stream)
        .map_err(|e| format!("DataWriter create failed: {}", e))?;
    writer
        .WriteBytes(&bytes)
        .map_err(|e| format!("Write bytes failed: {}", e))?;
    block_on_async(&writer.StoreAsync().map_err(|e| format!("StoreAsync failed: {}", e))?)
        .map_err(|e| format!("StoreAsync wait failed: {}", e))?;
    writer
        .DetachStream()
        .map_err(|e| format!("DetachStream failed: {}", e))?;

    let decoder = BitmapDecoder::CreateAsync(&stream)
        .map_err(|e| format!("BitmapDecoder create failed: {}", e))?;
    let decoder = block_on_async(&decoder)
        .map_err(|e| format!("BitmapDecoder wait failed: {}", e))?;

    let software_bitmap = decoder
        .GetSoftwareBitmapAsync()
        .map_err(|e| format!("GetSoftwareBitmap failed: {}", e))?;
    let software_bitmap = block_on_async(&software_bitmap)
        .map_err(|e| format!("GetSoftwareBitmap wait failed: {}", e))?;

    let engine = OcrEngine::TryCreateFromUserProfileLanguages()
        .map_err(|e| format!("OCR engine create failed: {}", e))?;

    let result = engine
        .RecognizeAsync(&software_bitmap)
        .map_err(|e| format!("OCR recognize failed: {}", e))?;
    let result = block_on_async(&result)
        .map_err(|e| format!("OCR recognize wait failed: {}", e))?;

    result
        .Text()
        .map_err(|e| format!("Read OCR text failed: {}", e))
        .map(|s| s.to_string())
}

#[tauri::command]
pub async fn ocr_image_item(app: AppHandle, id: i64) -> Result<String, String> {
    let state = app.state::<AppState>();
    let row = sqlx::query(
        "SELECT storage_path, is_private, metadata FROM clipboard_items WHERE id = ?1 AND content_type = 'image' LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Image item not found.".to_string())?;

    let is_private = row.try_get::<i64, _>("is_private").unwrap_or(0) != 0;
    if is_private {
        return Err("This item is private. Unlock it before running OCR.".to_string());
    }

    let data_url: String = row
        .try_get::<String, _>("storage_path")
        .map_err(|_| "Image storage not found.".to_string())?;
    if data_url.is_empty() {
        return Err("Image content is empty.".to_string());
    }

    let text = tauri::async_runtime::spawn_blocking(move || run_ocr(&data_url))
        .await
        .map_err(|e| format!("OCR task panicked: {}", e))??;

    if text.trim().is_empty() {
        return Err("No text recognized in the image.".to_string());
    }

    let mut metadata = parse_metadata(row.try_get("metadata").ok());
    metadata.insert("ocrText".to_string(), vec![text.clone()]);
    let metadata_json = serde_json::to_string(&metadata).unwrap_or_else(|_| "{}".into());

    sqlx::query("UPDATE clipboard_items SET metadata = ?1 WHERE id = ?2")
        .bind(&metadata_json)
        .bind(id)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    emit_changed(&app).await;
    Ok(text)
}
