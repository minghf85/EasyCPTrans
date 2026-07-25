// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use enigo::{Enigo, Key, KeyboardControllable};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, PhysicalPosition, WebviewWindowBuilder, WindowEvent,
};

mod commands;
mod db;
mod pipeline;
mod privacy;
mod shortcuts;
mod sync;

static APP_EXITING: AtomicBool = AtomicBool::new(false);

pub(crate) fn simulate_paste_impl() {
    let mut enigo = Enigo::new();

    #[cfg(target_os = "macos")]
    {
        enigo.key_down(Key::Meta);
        enigo.key_click(Key::Layout('v'));
        enigo.key_up(Key::Meta);
    }

    #[cfg(not(target_os = "macos"))]
    {
        enigo.key_down(Key::Control);
        enigo.key_click(Key::Layout('v'));
        enigo.key_up(Key::Control);
    }
}

pub(crate) fn simulate_copy_impl() {
    let mut enigo = Enigo::new();

    #[cfg(target_os = "macos")]
    {
        enigo.key_down(Key::Meta);
        enigo.key_click(Key::Layout('c'));
        enigo.key_up(Key::Meta);
    }

    #[cfg(not(target_os = "macos"))]
    {
        enigo.key_down(Key::Control);
        enigo.key_click(Key::Layout('c'));
        enigo.key_up(Key::Control);
    }
}

#[tauri::command]
fn simulate_paste() {
    simulate_paste_impl();
}

#[cfg(target_os = "windows")]
fn cursor_position_physical() -> Option<(i32, i32)> {
    use windows::Win32::{Foundation::POINT, UI::WindowsAndMessaging::GetCursorPos};

    let mut point = POINT::default();
    if unsafe { GetCursorPos(&mut point) }.is_ok() {
        Some((point.x, point.y))
    } else {
        None
    }
}

#[cfg(not(target_os = "windows"))]
fn cursor_position_physical() -> Option<(i32, i32)> {
    None
}

pub(crate) fn show_main_window_near_cursor<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    let size = window.outer_size().map_err(|e| e.to_string())?;
    let (mut next_x, mut next_y) = cursor_position_physical()
        .map(|(x, y)| (x + 16, y + 18))
        .unwrap_or((0, 0));

    if let Ok(monitors) = app.available_monitors() {
        for monitor in monitors {
            let position = monitor.position();
            let monitor_size = monitor.size();
            let left = position.x;
            let top = position.y;
            let right = left + monitor_size.width as i32;
            let bottom = top + monitor_size.height as i32;

            if next_x >= left && next_x <= right && next_y >= top && next_y <= bottom {
                next_x = next_x.clamp(left + 8, right - size.width as i32 - 8);
                next_y = next_y.clamp(top + 8, bottom - size.height as i32 - 8);
                break;
            }
        }
    }

    window
        .set_position(PhysicalPosition::new(next_x, next_y))
        .map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) fn toggle_main_window_from_shortcut<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    let visible = window.is_visible().map_err(|e| e.to_string())?;
    let focused = window.is_focused().unwrap_or(false);

    if visible && focused {
        window.hide().map_err(|e| e.to_string())?;
        return Ok(());
    }

    show_main_window_near_cursor(app)
}

fn read_window_state(app: &tauri::AppHandle) -> Option<(f64, f64, f64, f64)> {
    let conf_path = app.path().app_data_dir().ok()?.join("config.json");
    let data = std::fs::read_to_string(conf_path).ok()?;
    let parsed = serde_json::from_str::<serde_json::Value>(&data).ok()?;
    let width = parsed.get("windowWidth")?.as_f64()?;
    let height = parsed.get("windowHeight")?.as_f64()?;
    let x = parsed.get("windowX")?.as_f64()?;
    let y = parsed.get("windowY")?.as_f64()?;
    Some((width, height, x, y))
}

fn sanitize_window_state(
    app: &tauri::AppHandle,
    width: f64,
    height: f64,
    x: f64,
    y: f64,
) -> (f64, f64, f64, f64) {
    let width = width.max(320.0);
    let height = height.max(220.0);

    let Ok(monitors) = app.available_monitors() else {
        return (width, height, x, y);
    };
    if monitors.is_empty() {
        return (width, height, x, y);
    }

    let saved_left = x;
    let saved_top = y;
    let saved_right = x + width;
    let saved_bottom = y + height;

    for monitor in &monitors {
        let work_area = monitor.work_area();
        let scale = monitor.scale_factor();
        let left = work_area.position.x as f64 / scale;
        let top = work_area.position.y as f64 / scale;
        let work_width = work_area.size.width as f64 / scale;
        let work_height = work_area.size.height as f64 / scale;
        let right = left + work_width;
        let bottom = top + work_height;

        let intersects =
            saved_right > left && saved_left < right && saved_bottom > top && saved_top < bottom;
        if intersects {
            let clamped_width = width.min(work_width.max(320.0));
            let clamped_height = height.min(work_height.max(220.0));
            let max_x = (right - clamped_width).max(left);
            let max_y = (bottom - clamped_height).max(top);
            return (
                clamped_width,
                clamped_height,
                x.clamp(left, max_x),
                y.clamp(top, max_y),
            );
        }
    }

    let fallback = &monitors[0];
    let work_area = fallback.work_area();
    let scale = fallback.scale_factor();
    let left = work_area.position.x as f64 / scale;
    let top = work_area.position.y as f64 / scale;
    let work_width = work_area.size.width as f64 / scale;
    let work_height = work_area.size.height as f64 / scale;
    let clamped_width = width.min(work_width.max(320.0));
    let clamped_height = height.min(work_height.max(220.0));
    let fallback_x = left + ((work_width - clamped_width) / 2.0).max(0.0);
    let fallback_y = top + ((work_height - clamped_height) / 2.0).max(0.0);

    (clamped_width, clamped_height, fallback_x, fallback_y)
}

fn create_main_window(app: &mut tauri::App) -> tauri::Result<()> {
    if app.get_webview_window("main").is_some() {
        return Ok(());
    }

    let Some(base_config) = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == "main")
        .cloned()
    else {
        return Err(tauri::Error::WindowLabelAlreadyExists("main".into()));
    };

    let mut window_config = base_config;
    if let Some((width, height, x, y)) = read_window_state(app.handle()) {
        let (width, height, x, y) = sanitize_window_state(app.handle(), width, height, x, y);
        println!(
            "Restoring window state (logical): width={}, height={}, x={}, y={}",
            width, height, x, y
        );
        window_config.width = width;
        window_config.height = height;
        window_config.x = Some(x);
        window_config.y = Some(y);
        window_config.center = false;
    }

    window_config.visible = true;
    WebviewWindowBuilder::from_config(app.handle(), &window_config)?.build()?;
    Ok(())
}

fn save_window_state(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let Ok(size) = window.inner_size() else {
        return;
    };
    let Ok(position) = window.outer_position() else {
        return;
    };
    let Ok(scale_factor) = window.scale_factor() else {
        return;
    };
    let logical_size = size.to_logical::<f64>(scale_factor);
    let logical_position = position.to_logical::<f64>(scale_factor);
    let conf_path = match app.path().app_data_dir() {
        Ok(dir) => dir.join("config.json"),
        Err(_) => return,
    };

    let mut parsed = std::fs::read_to_string(&conf_path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}));

    parsed["windowWidth"] = serde_json::json!(logical_size.width);
    parsed["windowHeight"] = serde_json::json!(logical_size.height);
    parsed["windowX"] = serde_json::json!(logical_position.x);
    parsed["windowY"] = serde_json::json!(logical_position.y);

    if let Ok(serialized) = serde_json::to_string_pretty(&parsed) {
        let _ = std::fs::write(&conf_path, serialized);
        println!(
            "Saved window state (logical): width={}, height={}, x={}, y={}",
            logical_size.width, logical_size.height, logical_position.x, logical_position.y
        );
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data = app.path().app_data_dir().unwrap();
            std::fs::create_dir_all(&app_data).ok();
            println!("APP DATA DIR: {:?}", app_data);

            let conf_path = app_data.join("config.json");
            let mut custom_cache_path = None;
            if let Ok(data) = std::fs::read_to_string(&conf_path) {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&data) {
                    if let Some(cp) = parsed.get("cachePath").and_then(|s| s.as_str()) {
                        if !cp.is_empty() {
                            custom_cache_path = Some(std::path::PathBuf::from(cp));
                        }
                    }
                }
            }

            let final_db_dir = if let Some(ref cp) = custom_cache_path {
                std::fs::create_dir_all(cp).ok();
                cp.clone()
            } else {
                app_data.clone()
            };

            let db_path = final_db_dir.join("clipboard.db");
            let pool = tauri::async_runtime::block_on(async {
                let pool = db::open_pool(&db_path).await?;
                db::ensure_schema(&pool).await?;
                Ok::<_, sqlx::Error>(pool)
            })?;
            app.manage(db::AppState { pool });

            let _ = tauri::async_runtime::block_on(async {
                let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(1) FROM clipboard_items")
                    .fetch_one(&app.state::<db::AppState>().pool)
                    .await
                    .unwrap_or(0);
                println!("Clipboard rows on startup: {}", count);
            });

            create_main_window(app)?;

            let shortcut_report = shortcuts::register_shortcuts(
                app.handle(),
                &commands::read_app_config(app.handle()),
            );
            if !shortcut_report.failed.is_empty() {
                println!(
                    "[EasyCPTrans] Some shortcuts were not registered on startup: {:?}",
                    shortcut_report
                        .failed
                        .iter()
                        .map(|item| format!("{} => {}", item.shortcut, item.reason))
                        .collect::<Vec<_>>()
                );
            }

            let show_item = MenuItem::with_id(app, "show", "Show EasyCPTrans", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            TrayIconBuilder::new()
                .icon(
                    app.default_window_icon()
                        .cloned()
                        .ok_or("default window icon is missing")?,
                )
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        APP_EXITING.store(true, Ordering::SeqCst);
                        save_window_state(app);
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.close();
                        }
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    shortcuts::handle_plugin_shortcut(app, shortcut, event);
                })
                .build(),
        )
        .plugin(tauri_plugin_clipboard_x::init())
        .plugin(tauri_plugin_opener::init())
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if APP_EXITING.load(Ordering::SeqCst) {
                    return;
                }
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            simulate_paste,
            commands::ingest_clipboard,
            commands::read_clipboard_files,
            commands::get_active_window,
            commands::is_paste_shortcut_down,
            commands::load_history,
            commands::get_text_item,
            commands::get_privacy_status,
            commands::set_privacy_password,
            commands::protect_item,
            commands::unprotect_item,
            commands::toggle_pin,
            commands::delete_item,
            commands::set_tags,
            commands::rename_device_tag,
            commands::mark_used,
            commands::update_text_item,
            commands::create_stack_text_item,
            commands::translate_selected_text,
            commands::convert_ecdict_csv_to_sqlite,
            commands::save_temp_image,
            commands::read_image_as_data_url,
            commands::get_config,
            commands::set_config,
            shortcuts::refresh_global_shortcuts,
            shortcuts::probe_shortcut_available,
            shortcuts::sync_queue_state,
            sync::trigger_sync,
            sync::verify_webdav
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
