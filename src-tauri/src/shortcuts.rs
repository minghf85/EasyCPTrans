use crate::commands::AppConfig;
use crate::db::AppState;
use base64::Engine;
use once_cell::sync::Lazy;
use serde::Serialize;
use sqlx::Row;
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::PathBuf,
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

const DEFAULT_PANEL_SHORTCUT: &str = "CommandOrControl+Shift+V";
const DEFAULT_QUEUE_STEP_SHORTCUT: &str = "CommandOrControl+Alt+V";
const DEFAULT_QUICK_PASTE_PREFIX: &str = "CommandOrControl+Shift";
const DEFAULT_STACK_SHORTCUT_PREFIX: &str = "CommandOrControl+Alt";
const DEFAULT_WORD_TRANSLATE_SHORTCUT: &str = "Alt+C";
const LEGACY_PANEL_SHORTCUT: &str = "Super+Shift+V";
const SHORTCUT_DEBOUNCE_WINDOW: Duration = Duration::from_millis(280);

static LAST_SHORTCUT_FIRE: Lazy<Mutex<HashMap<String, Instant>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static SHORTCUT_ACTIONS: Lazy<Mutex<HashMap<u32, (ShortcutAction, String)>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static QUEUE_STATE: Lazy<Mutex<QueueState>> = Lazy::new(|| Mutex::new(QueueState::default()));

#[derive(Debug, Default, Clone)]
struct QueueState {
    ids: Vec<i64>,
}

const QUEUE_UPDATED_EVENT_NAME: &str = "easycp://queue-updated";
const STACK_MODE_EVENT_NAME: &str = "easycp://stack-mode";
const STACK_RESET_EVENT_NAME: &str = "easycp://stack-reset";
const CLIPBOARD_OVERRIDE_EVENT_NAME: &str = "easycp://clipboard-override";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct QueueUpdatedEvent {
    ids: Vec<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StackModeEvent {
    direction: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClipboardOverrideEvent {
    sig: String,
}

#[derive(Debug, Clone)]
enum ShortcutAction {
    TogglePanel,
    QueueStep,
    StackMode { direction: StackDirection },
    TranslateSelection,
    QuickPaste { index: usize },
}

#[derive(Debug, Clone, Copy)]
enum StackDirection {
    Up,
    Down,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutRegistrationFailure {
    pub shortcut: String,
    pub action: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutRegistrationReport {
    pub registered: Vec<String>,
    pub failed: Vec<ShortcutRegistrationFailure>,
}

fn normalize_shortcut_part(part: &str) -> String {
    let lower = part.trim().to_lowercase();
    match lower.as_str() {
        "ctrl" | "control" | "commandorcontrol" | "cmdorctrl" | "cmdorcontrol" => {
            "CommandOrControl".to_string()
        }
        "alt" | "option" => "Alt".to_string(),
        "shift" => "Shift".to_string(),
        "super" | "meta" | "win" | "windows" | "command" | "cmd" => "Super".to_string(),
        "escape" => "Esc".to_string(),
        "arrowup" => "Up".to_string(),
        "arrowdown" => "Down".to_string(),
        "arrowleft" => "Left".to_string(),
        "arrowright" => "Right".to_string(),
        "" => String::new(),
        _ if part.trim().len() == 1 => part.trim().to_uppercase(),
        _ => part.trim().to_string(),
    }
}

pub fn canonicalize_shortcut(value: &str) -> String {
    let modifier_order = ["CommandOrControl", "Super", "Alt", "Shift"];
    let mut modifiers = Vec::new();
    let mut keys = Vec::new();

    for part in value.split('+') {
        let normalized = normalize_shortcut_part(part);
        if normalized.is_empty() {
            continue;
        }
        if modifier_order.contains(&normalized.as_str()) {
            modifiers.push(normalized);
        } else {
            keys.push(normalized);
        }
    }

    modifiers.sort_by_key(|item| {
        modifier_order
            .iter()
            .position(|candidate| candidate == item)
            .unwrap_or(usize::MAX)
    });
    modifiers.dedup();

    let mut result = modifiers;
    result.extend(keys);
    result.join("+")
}

fn non_empty_shortcut(value: &str, fallback: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        canonicalize_shortcut(trimmed)
    }
}

fn build_shortcut_bindings(config: &AppConfig) -> Vec<(String, ShortcutAction)> {
    let panel = {
        let candidate = non_empty_shortcut(&config.shortcut, DEFAULT_PANEL_SHORTCUT);
        if candidate.eq_ignore_ascii_case(LEGACY_PANEL_SHORTCUT) {
            DEFAULT_PANEL_SHORTCUT.to_string()
        } else {
            candidate
        }
    };
    let queue = non_empty_shortcut(&config.queue_step_shortcut, DEFAULT_QUEUE_STEP_SHORTCUT);
    let quick_prefix = non_empty_shortcut(&config.quick_paste_prefix, DEFAULT_QUICK_PASTE_PREFIX);
    let stack_prefix =
        non_empty_shortcut(&config.stack_shortcut_prefix, DEFAULT_STACK_SHORTCUT_PREFIX);
    let translate = non_empty_shortcut(
        &config.word_translate_shortcut,
        DEFAULT_WORD_TRANSLATE_SHORTCUT,
    );

    let mut entries = vec![
        (panel, ShortcutAction::TogglePanel),
        (queue, ShortcutAction::QueueStep),
        (translate, ShortcutAction::TranslateSelection),
        (
            format!("{stack_prefix}+Up"),
            ShortcutAction::StackMode {
                direction: StackDirection::Up,
            },
        ),
        (
            format!("{stack_prefix}+Down"),
            ShortcutAction::StackMode {
                direction: StackDirection::Down,
            },
        ),
    ];

    if !quick_prefix.is_empty() {
        for index in 0..10 {
            let number_key = if index == 9 {
                "0".to_string()
            } else {
                (index + 1).to_string()
            };
            entries.push((
                format!("{quick_prefix}+{number_key}"),
                ShortcutAction::QuickPaste { index },
            ));
        }
    }

    entries
}

fn action_name(action: &ShortcutAction) -> String {
    match action {
        ShortcutAction::TogglePanel => "toggle-panel".to_string(),
        ShortcutAction::QueueStep => "queue-step".to_string(),
        ShortcutAction::StackMode { direction } => match direction {
            StackDirection::Up => "stack-up".to_string(),
            StackDirection::Down => "stack-down".to_string(),
        },
        ShortcutAction::TranslateSelection => "translate-selection".to_string(),
        ShortcutAction::QuickPaste { index } => format!("quick-paste-{}", index + 1),
    }
}

fn should_emit_shortcut(shortcut: &str) -> bool {
    let Ok(mut guard) = LAST_SHORTCUT_FIRE.lock() else {
        return true;
    };
    let now = Instant::now();
    if let Some(last_fire) = guard.get(shortcut) {
        if now.duration_since(*last_fire) < SHORTCUT_DEBOUNCE_WINDOW {
            return false;
        }
    }
    guard.insert(shortcut.to_string(), now);
    true
}

#[cfg(target_os = "windows")]
fn is_shortcut_modifier_down() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VIRTUAL_KEY, VK_CONTROL, VK_LCONTROL, VK_LMENU, VK_LSHIFT, VK_LWIN,
        VK_MENU, VK_RCONTROL, VK_RMENU, VK_RSHIFT, VK_RWIN, VK_SHIFT,
    };

    let is_down =
        |key: VIRTUAL_KEY| unsafe { (GetAsyncKeyState(key.0 as i32) as u16 & 0x8000) != 0 };
    [
        VK_CONTROL,
        VK_LCONTROL,
        VK_RCONTROL,
        VK_SHIFT,
        VK_LSHIFT,
        VK_RSHIFT,
        VK_MENU,
        VK_LMENU,
        VK_RMENU,
        VK_LWIN,
        VK_RWIN,
    ]
    .into_iter()
    .any(is_down)
}

#[cfg(not(target_os = "windows"))]
fn is_shortcut_modifier_down() -> bool {
    false
}

fn wait_for_shortcut_release() {
    for _ in 0..20 {
        if !is_shortcut_modifier_down() {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
}

#[derive(Debug, Clone)]
struct ShortcutClipboardItem {
    id: i64,
    content_type: String,
    content: String,
    metadata: HashMap<String, Vec<String>>,
    is_private: bool,
}

impl ShortcutClipboardItem {
    fn override_sig(&self) -> String {
        match self.content_type.as_str() {
            "file" => format!(
                "files_{}",
                self.content
                    .split('\n')
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .collect::<Vec<_>>()
                    .join("|")
            ),
            "image" => {
                if self.content.starts_with("data:image") {
                    format!("image_item_{}", self.id)
                } else {
                    format!("img_path_{}", self.content)
                }
            }
            _ => self.content.clone(),
        }
    }
}

fn emit_clipboard_override<R: Runtime>(app: &AppHandle<R>, sig: String) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit(
            CLIPBOARD_OVERRIDE_EVENT_NAME,
            ClipboardOverrideEvent { sig },
        );
    }
}

async fn load_recent_item<R: Runtime>(
    app: &AppHandle<R>,
    index: usize,
) -> Result<Option<ShortcutClipboardItem>, String> {
    let state = app.state::<AppState>();
    let row = sqlx::query(
        "SELECT id, content_type, preview_text, storage_path, metadata, is_private
         FROM clipboard_items
         ORDER BY is_pinned DESC, last_used_at DESC, id DESC
         LIMIT 1 OFFSET ?1",
    )
    .bind(index as i64)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row.map(|row| {
        let content_type: String = row.get("content_type");
        let preview: Option<String> = row.try_get("preview_text").ok();
        let storage: Option<String> = row.try_get("storage_path").ok();
        let metadata = row
            .try_get::<String, _>("metadata")
            .ok()
            .and_then(|value| serde_json::from_str::<HashMap<String, Vec<String>>>(&value).ok())
            .unwrap_or_default();
        let content = if content_type == "text" {
            preview.unwrap_or_default()
        } else {
            storage.unwrap_or_default()
        };

        ShortcutClipboardItem {
            id: row.get("id"),
            content_type,
            content,
            metadata,
            is_private: row.try_get::<i64, _>("is_private").unwrap_or(0) != 0,
        }
    }))
}

async fn load_item_by_id<R: Runtime>(
    app: &AppHandle<R>,
    id: i64,
) -> Result<Option<ShortcutClipboardItem>, String> {
    let state = app.state::<AppState>();
    let row = sqlx::query(
        "SELECT id, content_type, preview_text, storage_path, metadata, is_private
         FROM clipboard_items
         WHERE id = ?1
         LIMIT 1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row.map(|row| {
        let content_type: String = row.get("content_type");
        let preview: Option<String> = row.try_get("preview_text").ok();
        let storage: Option<String> = row.try_get("storage_path").ok();
        let metadata = row
            .try_get::<String, _>("metadata")
            .ok()
            .and_then(|value| serde_json::from_str::<HashMap<String, Vec<String>>>(&value).ok())
            .unwrap_or_default();
        let content = if content_type == "text" {
            preview.unwrap_or_default()
        } else {
            storage.unwrap_or_default()
        };

        ShortcutClipboardItem {
            id: row.get("id"),
            content_type,
            content,
            metadata,
            is_private: row.try_get::<i64, _>("is_private").unwrap_or(0) != 0,
        }
    }))
}

async fn mark_item_used<R: Runtime>(app: &AppHandle<R>, id: i64) -> Result<(), String> {
    let state = app.state::<AppState>();
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
    Ok(())
}

async fn write_item_to_clipboard<R: Runtime>(
    app: &AppHandle<R>,
    item: &ShortcutClipboardItem,
    plain_text: bool,
) -> Result<(), String> {
    let started = Instant::now();
    println!(
        "[EasyCPTrans] Shortcut write clipboard start: id={}, type={}, plain_text={}",
        item.id, item.content_type, plain_text
    );
    if item.is_private {
        return Err("This item is private. Unlock it before pasting.".to_string());
    }

    let result = if plain_text {
        match item.content_type.as_str() {
            "text" | "file" => tauri_plugin_clipboard_x::write_text(item.content.clone()).await,
            _ => Err("Plain-text paste is only supported for text and file items.".to_string()),
        }
    } else {
        match item.content_type.as_str() {
            "text" => tauri_plugin_clipboard_x::write_text(item.content.clone()).await,
            "file" => {
                let files = item
                    .content
                    .split('\n')
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty())
                    .collect::<Vec<_>>();
                if files.is_empty() {
                    return Err("No files to paste.".to_string());
                }
                tauri_plugin_clipboard_x::write_files(files).await
            }
            "image" => {
                let image_path = if item.content.starts_with("data:image") {
                    save_data_url_image(app, item)?
                } else {
                    item.content.clone()
                };
                tauri_plugin_clipboard_x::write_image(image_path).await
            }
            _ => Err(format!(
                "Unsupported clipboard item type: {}",
                item.content_type
            )),
        }
    };
    println!(
        "[EasyCPTrans] Shortcut write clipboard finish: id={}, type={}, ok={}, elapsed_ms={}",
        item.id,
        item.content_type,
        result.is_ok(),
        started.elapsed().as_millis()
    );
    result
}

fn save_data_url_image<R: Runtime>(
    app: &AppHandle<R>,
    item: &ShortcutClipboardItem,
) -> Result<String, String> {
    if let Some(path) = item
        .metadata
        .get("shortcutImagePath")
        .and_then(|values| values.first())
        .filter(|path| std::path::Path::new(path.as_str()).exists())
    {
        return Ok(path.clone());
    }

    let data_url = &item.content;
    let (header, encoded) = data_url
        .split_once(',')
        .ok_or_else(|| "invalid data url".to_string())?;

    let extension = if header.contains("image/jpeg") {
        "jpg"
    } else if header.contains("image/gif") {
        "gif"
    } else if header.contains("image/bmp") {
        "bmp"
    } else if header.contains("image/webp") {
        "webp"
    } else {
        "png"
    };

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| e.to_string())?;

    let temp_dir: PathBuf = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("temp");
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let filename = format!("shortcut-image-{}.{}", item.id, extension);
    let image_path = temp_dir.join(filename);
    if !image_path.exists() {
        fs::write(&image_path, bytes).map_err(|e| e.to_string())?;
    }
    Ok(image_path.to_string_lossy().to_string())
}

async fn execute_recent_paste<R: Runtime>(app: AppHandle<R>, index: usize) -> Result<(), String> {
    clear_stack_mode(&app).await;
    let Some(item) = load_recent_item(&app, index).await? else {
        println!(
            "[EasyCPTrans] Quick paste skipped: no item at index {}",
            index
        );
        return Ok(());
    };

    println!(
        "[EasyCPTrans] Quick paste loading item: id={}, index={}, type={}",
        item.id, index, item.content_type
    );
    emit_clipboard_override(&app, item.override_sig());
    write_item_to_clipboard(&app, &item, false).await?;
    println!(
        "[EasyCPTrans] Quick paste wrote clipboard for item {}",
        item.id
    );

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    wait_for_shortcut_release();
    std::thread::sleep(Duration::from_millis(80));
    crate::simulate_paste_impl();
    println!(
        "[EasyCPTrans] Quick paste simulated Ctrl+V for item {}",
        item.id
    );
    Ok(())
}

async fn execute_queue_step<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    clear_stack_mode(&app).await;
    let (item_id, remaining_ids) = {
        let mut queue = QUEUE_STATE
            .lock()
            .map_err(|_| "Failed to lock queue state".to_string())?;

        if queue.ids.is_empty() {
            println!("[EasyCPTrans] Queue step skipped: queue is empty");
            return Ok(());
        }

        let item_id = queue.ids.remove(0);
        let remaining = queue.ids.clone();
        (item_id, remaining)
    };

    let Some(item) = load_item_by_id(&app, item_id).await? else {
        println!("[EasyCPTrans] Queue step skipped missing item {}", item_id);
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.emit(
                QUEUE_UPDATED_EVENT_NAME,
                QueueUpdatedEvent { ids: remaining_ids },
            );
        }
        return Ok(());
    };

    println!(
        "[EasyCPTrans] Queue step loading item: id={}, type={}",
        item.id, item.content_type
    );
    emit_clipboard_override(&app, item.override_sig());
    write_item_to_clipboard(&app, &item, false).await?;
    println!(
        "[EasyCPTrans] Queue step wrote clipboard for item {}",
        item.id
    );
    let _ = mark_item_used(&app, item.id).await;

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
        let _ = window.emit(
            QUEUE_UPDATED_EVENT_NAME,
            QueueUpdatedEvent { ids: remaining_ids },
        );
    }
    wait_for_shortcut_release();
    std::thread::sleep(Duration::from_millis(80));
    crate::simulate_paste_impl();
    println!(
        "[EasyCPTrans] Queue step simulated Ctrl+V for item {}",
        item.id
    );
    Ok(())
}

pub fn handle_plugin_shortcut<R: Runtime>(
    app: &AppHandle<R>,
    shortcut: &Shortcut,
    event: ShortcutEvent,
) {
    let Ok(guard) = SHORTCUT_ACTIONS.lock() else {
        println!("[EasyCPTrans] Failed to lock shortcut action registry.");
        return;
    };
    let Some((action, shortcut_text)) = guard.get(&shortcut.id()).cloned() else {
        println!(
            "[EasyCPTrans] Shortcut event received but no action mapping found: {}",
            shortcut.id()
        );
        return;
    };
    drop(guard);

    println!(
        "[EasyCPTrans] Plugin handler received shortcut: id={}, shortcut={}, state={:?}",
        shortcut.id(),
        shortcut_text,
        event.state
    );

    match action {
        ShortcutAction::TogglePanel => {
            if event.state != ShortcutState::Pressed {
                return;
            }
            if !should_emit_shortcut(&shortcut_text) {
                println!(
                    "[EasyCPTrans] Shortcut suppressed by debounce: {}",
                    shortcut_text
                );
                return;
            }
            spawn_clear_stack_mode(app.clone());
            if let Err(err) = crate::toggle_main_window_from_shortcut(app) {
                println!(
                    "[EasyCPTrans] Toggle panel shortcut failed: shortcut={}, error={}",
                    shortcut_text, err
                );
            }
        }
        ShortcutAction::QuickPaste { index } => {
            if event.state != ShortcutState::Released {
                return;
            }
            if !should_emit_shortcut(&shortcut_text) {
                println!(
                    "[EasyCPTrans] Shortcut suppressed by debounce: {}",
                    shortcut_text
                );
                return;
            }
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(err) = execute_recent_paste(app_handle, index).await {
                    println!("[EasyCPTrans] Quick paste shortcut failed: {}", err);
                }
            });
        }
        ShortcutAction::QueueStep => {
            if event.state != ShortcutState::Released {
                return;
            }
            if !should_emit_shortcut(&shortcut_text) {
                println!(
                    "[EasyCPTrans] Shortcut suppressed by debounce: {}",
                    shortcut_text
                );
                return;
            }
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(err) = execute_queue_step(app_handle).await {
                    println!("[EasyCPTrans] Queue step shortcut failed: {}", err);
                }
            });
        }
        ShortcutAction::StackMode { direction } => {
            if event.state != ShortcutState::Released {
                return;
            }
            if !should_emit_shortcut(&shortcut_text) {
                println!(
                    "[EasyCPTrans] Shortcut suppressed by debounce: {}",
                    shortcut_text
                );
                return;
            }
            let direction_text = match direction {
                StackDirection::Up => "up",
                StackDirection::Down => "down",
            };
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.emit(
                    STACK_MODE_EVENT_NAME,
                    StackModeEvent {
                        direction: direction_text.to_string(),
                    },
                );
            }
        }
        ShortcutAction::TranslateSelection => {
            if event.state != ShortcutState::Released {
                return;
            }
            if !should_emit_shortcut(&shortcut_text) {
                println!(
                    "[EasyCPTrans] Shortcut suppressed by debounce: {}",
                    shortcut_text
                );
                return;
            }
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(err) = crate::commands::translate_selected_text_impl(app_handle).await {
                    println!("[EasyCPTrans] Translate selection failed: {}", err);
                }
            });
        }
    }
}

#[tauri::command]
pub async fn sync_queue_state(ids: Vec<i64>) -> Result<(), String> {
    let mut queue = QUEUE_STATE
        .lock()
        .map_err(|_| "Failed to lock queue state".to_string())?;
    queue.ids = ids;
    Ok(())
}

async fn clear_stack_mode<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit(STACK_RESET_EVENT_NAME, ());
    }
}

fn spawn_clear_stack_mode<R: Runtime>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        clear_stack_mode(&app).await;
    });
}

pub fn register_shortcuts<R: Runtime>(
    app: &AppHandle<R>,
    config: &AppConfig,
) -> ShortcutRegistrationReport {
    let manager = app.global_shortcut();
    let _ = manager.unregister_all();
    if let Ok(mut guard) = SHORTCUT_ACTIONS.lock() {
        guard.clear();
    }
    if let Ok(mut guard) = LAST_SHORTCUT_FIRE.lock() {
        guard.clear();
    }

    let mut registered = Vec::new();
    let mut failed = Vec::new();
    let mut seen = HashSet::new();

    for (shortcut, action) in build_shortcut_bindings(config) {
        let normalized = canonicalize_shortcut(&shortcut);
        if normalized.is_empty() {
            continue;
        }

        let dedupe_key = normalized.to_lowercase();
        if !seen.insert(dedupe_key) {
            failed.push(ShortcutRegistrationFailure {
                shortcut: normalized.clone(),
                action: action_name(&action),
                reason: "Duplicate shortcut in current configuration".to_string(),
            });
            continue;
        }

        let parsed_shortcut = match normalized.parse::<Shortcut>() {
            Ok(value) => value,
            Err(err) => {
                let reason = err.to_string();
                println!(
                    "[EasyCPTrans] Failed to parse shortcut: action={}, shortcut={}, error={}",
                    action_name(&action),
                    normalized,
                    reason
                );
                failed.push(ShortcutRegistrationFailure {
                    shortcut: normalized,
                    action: action_name(&action),
                    reason,
                });
                continue;
            }
        };

        match manager.register(parsed_shortcut) {
            Ok(()) => {
                if let Ok(mut guard) = SHORTCUT_ACTIONS.lock() {
                    guard.insert(parsed_shortcut.id(), (action.clone(), normalized.clone()));
                }
                println!(
                    "[EasyCPTrans] Registered shortcut: action={}, shortcut={}",
                    action_name(&action),
                    normalized
                );
                registered.push(normalized);
            }
            Err(err) => {
                let reason = err.to_string();
                println!(
                    "[EasyCPTrans] Failed to register shortcut: action={}, shortcut={}, error={}",
                    action_name(&action),
                    normalized,
                    reason
                );
                failed.push(ShortcutRegistrationFailure {
                    shortcut: normalized,
                    action: action_name(&action),
                    reason,
                });
            }
        }
    }

    ShortcutRegistrationReport { registered, failed }
}

#[tauri::command]
pub async fn refresh_global_shortcuts(
    app: AppHandle,
) -> Result<ShortcutRegistrationReport, String> {
    let config = crate::commands::read_app_config(&app);
    Ok(register_shortcuts(&app, &config))
}

#[tauri::command]
pub async fn probe_shortcut_available(app: AppHandle, shortcut: String) -> Result<bool, String> {
    let normalized = canonicalize_shortcut(&shortcut);
    if normalized.is_empty() {
        return Ok(false);
    }

    let parsed_shortcut = normalized
        .parse::<Shortcut>()
        .map_err(|err| err.to_string())?;
    let manager = app.global_shortcut();
    if manager.is_registered(parsed_shortcut) {
        return Ok(false);
    }

    match manager.register(parsed_shortcut) {
        Ok(()) => {
            let _ = manager.unregister(parsed_shortcut);
            Ok(true)
        }
        Err(_) => Ok(false),
    }
}
