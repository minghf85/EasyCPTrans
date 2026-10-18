use crate::commands::{
    attach_device_identity, emit_changed, merge_unique_tags, parse_metadata, read_app_config,
};
use crate::db::{compute_hash, AppState};
use crate::pipeline::{ClipboardItem, Pipeline, PipelineOutcome};
use base64::Engine as _;
use serde::Serialize;
use sqlx::{Row, SqlitePool};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Once;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use windows::{
    core::{Interface, HSTRING},
    Globalization::Language,
    Graphics::Imaging::{
        BitmapAlphaMode, BitmapDecoder, BitmapInterpolationMode, BitmapPixelFormat, BitmapTransform,
        ColorManagementMode, ExifOrientationMode, SoftwareBitmap,
    },
    Media::Ocr::OcrEngine,
    Storage::Streams::{DataWriter, InMemoryRandomAccessStream},
    Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED},
};
use windows_future::{AsyncStatus, IAsyncInfo, IAsyncOperation};

/// Below this shortest-edge length the image is upscaled before recognition:
/// the Windows recognizer reads small screenshots noticeably better at 2x.
const SMALL_IMAGE_EDGE: u32 = 1200;
/// Above this longest-edge length the image is downscaled again.
const LARGE_IMAGE_EDGE: u32 = 4000;
/// Encoded (base64) size above which automatic OCR is skipped to stay cheap.
const AUTO_OCR_MAX_ENCODED_LEN: usize = 12 * 1024 * 1024;
/// How many extra installed languages to try when the profile engine finds nothing.
const FALLBACK_LANGUAGE_TRIES: usize = 2;

pub const OCR_TAG: &str = "OCR";

static WINRT_INIT: Once = Once::new();

fn ensure_winrt_mta() {
    WINRT_INIT.call_once(|| unsafe {
        let _ = RoInitialize(RO_INIT_MULTITHREADED);
    });
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrLanguage {
    pub tag: String,
    pub name: String,
}

pub struct OcrOutcome {
    pub text: String,
    pub language_tag: String,
    pub language_name: String,
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

fn create_decoder(data_url: &str) -> Result<BitmapDecoder, String> {
    let bytes = data_url_to_bytes(data_url)?;
    if bytes.is_empty() {
        return Err("Image is empty".to_string());
    }

    let stream =
        InMemoryRandomAccessStream::new().map_err(|e| format!("Stream create failed: {}", e))?;
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

    block_on_async(
        &BitmapDecoder::CreateAsync(&stream)
            .map_err(|e| format!("BitmapDecoder create failed: {}", e))?,
    )
    .map_err(|e| format!("BitmapDecoder wait failed: {}", e))
}

/// Decides the scaled size for recognition: upscale small crop/screenshot images
/// so thin strokes survive, downscale very large ones to stay under the engine
/// limit. Returns `None` when the image is already in a good range.
fn target_size(width: u32, height: u32, max_dimension: u32) -> Option<(u32, u32)> {
    if width == 0 || height == 0 {
        return None;
    }
    let longest = width.max(height) as f64;
    let shortest = width.min(height) as f64;
    let limit = max_dimension.max(1) as f64;

    let mut scale = if shortest < SMALL_IMAGE_EDGE as f64 {
        2.0
    } else {
        1.0
    };
    if longest * scale > LARGE_IMAGE_EDGE as f64 {
        scale = LARGE_IMAGE_EDGE as f64 / longest;
    }
    if longest * scale > limit {
        scale = limit / longest;
    }
    if (scale - 1.0).abs() < 0.01 {
        return None;
    }

    let scaled_width = ((width as f64 * scale).round() as i64).clamp(1, max_dimension.max(1) as i64);
    let scaled_height =
        ((height as f64 * scale).round() as i64).clamp(1, max_dimension.max(1) as i64);
    Some((scaled_width as u32, scaled_height as u32))
}

/// Produces a `Bgra8`/premultiplied bitmap scaled for OCR — the only pixel format
/// `OcrEngine::RecognizeAsync` accepts.
fn prepare_bitmap(decoder: &BitmapDecoder) -> Result<SoftwareBitmap, String> {
    let width = decoder
        .PixelWidth()
        .map_err(|e| format!("Read image width failed: {}", e))?;
    let height = decoder
        .PixelHeight()
        .map_err(|e| format!("Read image height failed: {}", e))?;
    let max_dimension = OcrEngine::MaxImageDimension().unwrap_or(LARGE_IMAGE_EDGE);

    let transform =
        BitmapTransform::new().map_err(|e| format!("BitmapTransform create failed: {}", e))?;
    if let Some((scaled_width, scaled_height)) = target_size(width, height, max_dimension) {
        transform
            .SetScaledWidth(scaled_width)
            .map_err(|e| format!("SetScaledWidth failed: {}", e))?;
        transform
            .SetScaledHeight(scaled_height)
            .map_err(|e| format!("SetScaledHeight failed: {}", e))?;
        transform
            .SetInterpolationMode(BitmapInterpolationMode::Linear)
            .map_err(|e| format!("SetInterpolationMode failed: {}", e))?;
    }

    block_on_async(
        &decoder
            .GetSoftwareBitmapTransformedAsync(
                BitmapPixelFormat::Bgra8,
                BitmapAlphaMode::Premultiplied,
                &transform,
                ExifOrientationMode::RespectExifOrientation,
                ColorManagementMode::DoNotColorManage,
            )
            .map_err(|e| format!("GetSoftwareBitmap failed: {}", e))?,
    )
    .map_err(|e| format!("GetSoftwareBitmap wait failed: {}", e))
}

fn available_languages() -> Vec<OcrLanguage> {
    let mut languages = Vec::new();
    let Ok(list) = OcrEngine::AvailableRecognizerLanguages() else {
        return languages;
    };
    let Ok(size) = list.Size() else {
        return languages;
    };
    for index in 0..size {
        let Ok(language) = list.GetAt(index) else {
            continue;
        };
        let tag = language
            .LanguageTag()
            .map(|value| value.to_string())
            .unwrap_or_default();
        if tag.is_empty() {
            continue;
        }
        let name = language
            .DisplayName()
            .map(|value| value.to_string())
            .unwrap_or_else(|_| tag.clone());
        languages.push(OcrLanguage { tag, name });
    }
    languages
}

fn installed_languages_hint() -> String {
    let languages = available_languages();
    if languages.is_empty() {
        return "No OCR language pack is installed. Add one in Windows Settings → Time & language → Language & region → (language) → Language options → Optical character recognition.".to_string();
    }
    let tags = languages
        .iter()
        .map(|language| language.tag.clone())
        .collect::<Vec<_>>()
        .join(", ");
    format!("Installed OCR languages: {}", tags)
}

fn language_name_for(tag: &str) -> String {
    available_languages()
        .into_iter()
        .find(|language| language.tag.eq_ignore_ascii_case(tag))
        .map(|language| language.name)
        .unwrap_or_else(|| tag.to_string())
}

fn create_engine(language: Option<&str>) -> Result<OcrEngine, String> {
    match language.map(str::trim).filter(|value| !value.is_empty()) {
        Some(tag) => {
            let tag = HSTRING::from(tag);
            let language = Language::CreateLanguage(&tag)
                .map_err(|e| format!("Invalid OCR language '{}': {}", tag, e))?;
            OcrEngine::TryCreateFromLanguage(&language).map_err(|_| {
                format!(
                    "OCR language pack for '{}' is not available. {}",
                    tag,
                    installed_languages_hint()
                )
            })
        }
        None => OcrEngine::TryCreateFromUserProfileLanguages().map_err(|_| {
            format!(
                "No OCR engine available for the current Windows languages. {}",
                installed_languages_hint()
            )
        }),
    }
}

fn engine_language_tag(engine: &OcrEngine) -> String {
    engine
        .RecognizerLanguage()
        .and_then(|language| language.LanguageTag())
        .map(|tag| tag.to_string())
        .unwrap_or_default()
}

fn recognize_text(engine: &OcrEngine, bitmap: &SoftwareBitmap) -> Result<String, String> {
    let result = block_on_async(
        &engine
            .RecognizeAsync(bitmap)
            .map_err(|e| format!("OCR recognize failed: {}", e))?,
    )
    .map_err(|e| format!("OCR recognize wait failed: {}", e))?;

    result
        .Text()
        .map_err(|e| format!("Read OCR text failed: {}", e))
        .map(|value| normalize_ocr_text(&value.to_string()))
}

/// Normalizes the Windows recognizer output: CRLF to LF, collapsed blank lines,
/// no trailing whitespace — so the text round-trips cleanly into other apps.
fn normalize_ocr_text(raw: &str) -> String {
    let unified = raw.replace("\r\n", "\n").replace('\r', "\n");
    let mut lines: Vec<&str> = Vec::new();
    for line in unified.split('\n') {
        let trimmed = line.trim_end();
        if trimmed.trim().is_empty() && lines.last().map(|last| last.is_empty()).unwrap_or(true) {
            continue;
        }
        lines.push(trimmed);
    }
    while lines.last().map(|line| line.is_empty()).unwrap_or(false) {
        lines.pop();
    }
    lines.join("\n")
}

fn run_ocr(data_url: &str, language: Option<&str>) -> Result<OcrOutcome, String> {
    ensure_winrt_mta();

    let decoder = create_decoder(data_url)?;
    let bitmap = prepare_bitmap(&decoder)?;

    let requested = language.map(str::trim).filter(|value| !value.is_empty());
    let engine = create_engine(requested)?;
    let mut language_tag = engine_language_tag(&engine);
    if language_tag.is_empty() {
        language_tag = requested.unwrap_or_default().to_string();
    }
    let mut text = recognize_text(&engine, &bitmap)?;

    // The profile engine may pick a language that reads nothing from a mixed
    // script image; give the other installed languages a short chance.
    if text.is_empty() && requested.is_none() {
        let mut tries = 0;
        for candidate in available_languages() {
            if tries >= FALLBACK_LANGUAGE_TRIES {
                break;
            }
            if candidate.tag.eq_ignore_ascii_case(&language_tag) {
                continue;
            }
            tries += 1;
            let Ok(candidate_engine) = create_engine(Some(&candidate.tag)) else {
                continue;
            };
            let Ok(candidate_text) = recognize_text(&candidate_engine, &bitmap) else {
                continue;
            };
            if !candidate_text.is_empty() {
                text = candidate_text;
                language_tag = candidate.tag.clone();
                break;
            }
        }
    }

    Ok(OcrOutcome {
        text,
        language_name: language_name_for(&language_tag),
        language_tag,
    })
}

async fn store_ocr_result(
    app: &AppHandle,
    pool: &SqlitePool,
    item_id: i64,
    outcome: &OcrOutcome,
) -> Result<(), String> {
    let row = sqlx::query("SELECT metadata FROM clipboard_items WHERE id = ?1 LIMIT 1")
        .bind(item_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
    let Some(row) = row else {
        return Err("Image item not found.".to_string());
    };

    let mut metadata = parse_metadata(row.try_get("metadata").ok());
    metadata.insert("ocrText".to_string(), vec![outcome.text.clone()]);
    metadata.insert(
        "ocrLanguage".to_string(),
        vec![outcome.language_tag.clone()],
    );
    metadata.insert(
        "ocrLanguageName".to_string(),
        vec![outcome.language_name.clone()],
    );
    metadata.insert(
        "ocrAt".to_string(),
        vec![chrono::Utc::now().timestamp().to_string()],
    );
    metadata.remove("ocrError");

    let metadata_json = serde_json::to_string(&metadata).unwrap_or_else(|_| "{}".into());
    sqlx::query("UPDATE clipboard_items SET metadata = ?1 WHERE id = ?2")
        .bind(&metadata_json)
        .bind(item_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    // Recognition just gave this image the only searchable text it will ever
    // have, which is the one moment a regex rule can apply to one — so the rules
    // run again here, and the tag shows up without the user re-copying anything.
    apply_tag_rules_to_recognized_item(app, pool, item_id, &metadata).await?;

    emit_changed(app).await;
    Ok(())
}

/// Awards regex-tag matches to an item that has just been recognized.
async fn apply_tag_rules_to_recognized_item(
    app: &AppHandle,
    pool: &SqlitePool,
    item_id: i64,
    metadata: &std::collections::HashMap<String, Vec<String>>,
) -> Result<(), String> {
    let rules = crate::commands::tag_rules_from_config(&crate::commands::read_app_config(app));
    if rules.is_empty() {
        return Ok(());
    }

    let row = sqlx::query("SELECT content_type, content, tags FROM clipboard_items WHERE id = ?1 LIMIT 1")
        .bind(item_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
    let Some(row) = row else {
        return Ok(());
    };

    let mut item = crate::pipeline::ClipboardItem {
        content_type: row.try_get("content_type").unwrap_or_default(),
        content: row.try_get("content").unwrap_or_default(),
        source_app: None,
        metadata: metadata.clone(),
        tags: row
            .try_get::<Option<String>, _>("tags")
            .ok()
            .flatten()
            .and_then(|raw| serde_json::from_str::<Vec<String>>(&raw).ok())
            .unwrap_or_default(),
    };

    let existing = item.tags.clone();
    crate::pipeline::tag_rules::apply_tag_rules(&mut item, &rules);
    if item.tags == existing {
        return Ok(());
    }

    let tags_json = serde_json::to_string(&item.tags).unwrap_or_else(|_| "[]".into());
    sqlx::query("UPDATE clipboard_items SET tags = ?1 WHERE id = ?2")
        .bind(&tags_json)
        .bind(item_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_ocr_languages() -> Result<Vec<OcrLanguage>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        ensure_winrt_mta();
        available_languages()
    })
    .await
    .map_err(|e| format!("OCR language lookup failed: {}", e))
}

#[tauri::command]
pub async fn ocr_image_item(
    app: AppHandle,
    id: i64,
    language: Option<String>,
) -> Result<String, String> {
    let state = app.state::<AppState>();
    let row = sqlx::query(
        "SELECT storage_path, is_private FROM clipboard_items WHERE id = ?1 AND content_type = 'image' LIMIT 1",
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

    let requested = language.filter(|value| !value.trim().is_empty()).or_else(|| {
        let configured = read_app_config(&app).ocr_language;
        if configured.trim().is_empty() {
            None
        } else {
            Some(configured)
        }
    });

    let outcome = tauri::async_runtime::spawn_blocking(move || {
        run_ocr(&data_url, requested.as_deref())
    })
    .await
    .map_err(|e| format!("OCR task panicked: {}", e))??;

    if outcome.text.trim().is_empty() {
        return Err(format!(
            "No text recognized in the image. {}",
            installed_languages_hint()
        ));
    }

    store_ocr_result(&app, &state.pool, id, &outcome).await?;
    Ok(outcome.text)
}

/// Persists the text the user reviewed/edited in the OCR panel.
#[tauri::command]
pub async fn set_ocr_text(app: AppHandle, id: i64, text: String) -> Result<(), String> {
    let normalized = normalize_ocr_text(&text);
    if normalized.trim().is_empty() {
        return Err("OCR text cannot be empty.".to_string());
    }

    let state = app.state::<AppState>();
    let row = sqlx::query(
        "SELECT metadata FROM clipboard_items WHERE id = ?1 AND content_type = 'image' LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Image item not found.".to_string())?;

    let mut metadata = parse_metadata(row.try_get("metadata").ok());
    metadata.insert("ocrText".to_string(), vec![normalized]);
    metadata.insert("ocrEdited".to_string(), vec!["true".to_string()]);
    let metadata_json = serde_json::to_string(&metadata).unwrap_or_else(|_| "{}".into());

    sqlx::query("UPDATE clipboard_items SET metadata = ?1 WHERE id = ?2")
        .bind(&metadata_json)
        .bind(id)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    emit_changed(&app).await;
    Ok(())
}

/// Turns an image's recognized text into a regular text item so it can be pasted
/// anywhere — the screenshot stays untouched in the history.
#[tauri::command]
pub async fn create_text_item_from_ocr(app: AppHandle, id: i64) -> Result<i64, String> {
    let state = app.state::<AppState>();
    let row = sqlx::query(
        "SELECT metadata, is_private FROM clipboard_items WHERE id = ?1 AND content_type = 'image' LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Image item not found.".to_string())?;

    if row.try_get::<i64, _>("is_private").unwrap_or(0) != 0 {
        return Err("This item is private. Unlock it before saving its text.".to_string());
    }

    let image_metadata = parse_metadata(row.try_get("metadata").ok());
    let text = image_metadata
        .get("ocrText")
        .and_then(|values| values.first())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Run OCR before saving the text as an item.".to_string())?;

    let source_app = image_metadata
        .get("sourceApp")
        .and_then(|values| values.first())
        .cloned();
    let base_metadata = HashMap::from([
        ("originImageId".to_string(), vec![id.to_string()]),
        ("ocr".to_string(), vec!["true".to_string()]),
        (
            "length".to_string(),
            vec![text.chars().count().to_string()],
        ),
    ]);

    let raw = ClipboardItem {
        content_type: "text".to_string(),
        content: text.clone(),
        source_app: source_app.clone(),
        metadata: base_metadata.clone(),
        tags: Vec::new(),
    };
    let mut processed = match Pipeline::default().run(raw) {
        PipelineOutcome::Accepted(item) => item,
        // The OCR text is user-requested content: keep it even if a pipeline
        // interceptor would have dropped the same text coming from the clipboard.
        PipelineOutcome::Dropped { .. } => ClipboardItem {
            content_type: "text".to_string(),
            content: text.clone(),
            source_app,
            metadata: base_metadata,
            tags: Vec::new(),
        },
    };

    let app_config = read_app_config(&app);
    attach_device_identity(
        &mut processed.metadata,
        &mut processed.tags,
        &app_config.device_name,
    );
    processed.tags = merge_unique_tags(
        processed.tags.clone(),
        vec!["Text".to_string(), OCR_TAG.to_string()],
    );

    let pool = &state.pool;
    let hash = compute_hash("text", &processed.content);
    let metadata_json = serde_json::to_string(&processed.metadata).unwrap_or_else(|_| "{}".into());

    let existing = sqlx::query(
        "SELECT id, tags FROM clipboard_items WHERE content_hash = ?1 AND (is_private IS NULL OR is_private = 0) LIMIT 1",
    )
    .bind(&hash)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let item_id = if let Some(row) = existing {
        // Identical text already in the history: refresh it instead of duplicating.
        let id: i64 = row.try_get("id").map_err(|e| e.to_string())?;
        let merged = merge_unique_tags(
            crate::sync::parse_tags(row.try_get("tags").ok()),
            processed.tags.clone(),
        );
        let tags_json = serde_json::to_string(&merged).unwrap_or_else(|_| "[]".into());
        sqlx::query(
            "UPDATE clipboard_items
             SET last_used_at = CURRENT_TIMESTAMP,
                 use_count    = use_count + 1,
                 tags         = ?1
             WHERE id = ?2",
        )
        .bind(&tags_json)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
        id
    } else {
        let tags_json = serde_json::to_string(&processed.tags).unwrap_or_else(|_| "[]".into());
        sqlx::query(
            "INSERT INTO clipboard_items
                (content_type, content_hash, preview_text, storage_path, tags, metadata, use_count, last_used_at)
             VALUES ('text', ?1, ?2, NULL, ?3, ?4, 1, CURRENT_TIMESTAMP)",
        )
        .bind(&hash)
        .bind(&processed.content)
        .bind(&tags_json)
        .bind(&metadata_json)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?
        .last_insert_rowid()
    };

    emit_changed(&app).await;
    Ok(item_id)
}

/// Automatic OCR is allowed to hold one decoded image at a time. Copying several
/// screenshots in a row used to start one recognition per image; each keeps the
/// encoded data URL, the decoded bytes and a full-resolution WinRT bitmap alive
/// at once. A second arrival is skipped instead of queued — manual OCR from the
/// card still works, and the image is recognized the next time it is copied.
static AUTO_OCR_BUSY: AtomicBool = AtomicBool::new(false);

/// Clears `AUTO_OCR_BUSY` on every exit path, including the early returns below.
struct AutoOcrGuard;

impl Drop for AutoOcrGuard {
    fn drop(&mut self) {
        AUTO_OCR_BUSY.store(false, Ordering::Release);
    }
}

/// Schedules the hidden-panel trim however the recognition ended.
///
/// Recognition holds the largest buffers in the app, but it has three early
/// returns (decode failure, task panic, nothing recognized). Scheduling from a
/// guard means every one of them releases the memory, not just a success.
struct ScheduleTrimOnDrop(AppHandle);

impl Drop for ScheduleTrimOnDrop {
    fn drop(&mut self) {
        crate::memory::schedule_idle_trim(self.0.clone());
    }
}

/// Whether an automatic recognition is holding its image buffers right now.
///
/// The memory reclaimer uses this to skip a trim mid-recognition: trimming then
/// would just fault the same pages back in as the recognizer touches them.
pub(crate) fn auto_ocr_busy() -> bool {
    AUTO_OCR_BUSY.load(Ordering::Acquire)
}

/// Fire-and-forget OCR for freshly captured screenshots: the result lands in the
/// item metadata, which makes the image searchable by its text.
pub fn spawn_auto_ocr(app: AppHandle, item_id: i64, data_url: String) {
    if data_url.is_empty() || data_url.len() > AUTO_OCR_MAX_ENCODED_LEN {
        return;
    }
    if AUTO_OCR_BUSY.swap(true, Ordering::AcqRel) {
        println!("[EasyCPTrans] Auto OCR skipped: another recognition is running");
        return;
    }

    let config = read_app_config(&app);
    let configured = config.ocr_language.trim().to_string();

    tauri::async_runtime::spawn(async move {
        let _guard = AutoOcrGuard;
        let _trim = ScheduleTrimOnDrop(app.clone());
        let requested = if configured.is_empty() {
            None
        } else {
            Some(configured)
        };
        let outcome = tauri::async_runtime::spawn_blocking(move || {
            run_ocr(&data_url, requested.as_deref())
        })
        .await;

        let outcome = match outcome {
            Ok(Ok(outcome)) => outcome,
            Ok(Err(err)) => {
                println!("[EasyCPTrans] Auto OCR failed: {}", err);
                return;
            }
            Err(err) => {
                println!("[EasyCPTrans] Auto OCR task failed: {}", err);
                return;
            }
        };

        if outcome.text.trim().is_empty() {
            return;
        }

        let state = app.state::<AppState>();
        if let Err(err) = store_ocr_result(&app, &state.pool, item_id, &outcome).await {
            println!("[EasyCPTrans] Auto OCR store failed: {}", err);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_line_endings_and_padding() {
        assert_eq!(normalize_ocr_text("  hello\r\nworld  \r\n"), "  hello\nworld");
        assert_eq!(normalize_ocr_text("a\r\n\r\n\r\nb"), "a\n\nb");
        assert_eq!(normalize_ocr_text("\n\n\n"), "");
        assert_eq!(normalize_ocr_text("   "), "");
    }

    #[test]
    fn upscales_small_images_and_caps_large_ones() {
        assert_eq!(target_size(400, 300, 10000), Some((800, 600)));
        assert_eq!(target_size(8000, 4000, 10000), Some((4000, 2000)));
        assert_eq!(target_size(2000, 1500, 10000), None);
        assert_eq!(target_size(0, 100, 10000), None);
        // Never exceed the engine's maximum dimension.
        assert_eq!(target_size(600, 400, 1000), Some((1000, 667)));
    }
}
