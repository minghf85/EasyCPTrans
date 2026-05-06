// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use enigo::{Enigo, Key, KeyboardControllable};
use tauri::Manager;

mod commands;
mod db;
mod pipeline;

#[tauri::command]
fn simulate_paste() {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data = app.path().app_data_dir().unwrap();
            std::fs::create_dir_all(&app_data).ok();
            println!("APP DATA DIR: {:?}", app_data);

            let old_app_data = app_data.parent().unwrap().join("com.easycut.app");
            if old_app_data.exists() && old_app_data.join("clipboard.db").exists() && !app_data.join("clipboard.db").exists() {
                println!("Migrating data from {:?}", old_app_data);
                let _ = std::fs::copy(old_app_data.join("clipboard.db"), app_data.join("clipboard.db"));
                let _ = std::fs::copy(old_app_data.join("clipboard.db-shm"), app_data.join("clipboard.db-shm"));
                let _ = std::fs::copy(old_app_data.join("clipboard.db-wal"), app_data.join("clipboard.db-wal"));
                let _ = std::fs::copy(old_app_data.join("config.json"), app_data.join("config.json"));
            }

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
                // 如果启用了自定义路径且该路径下无 db，则从默认路径迁移过去
                if !cp.join("clipboard.db").exists() && app_data.join("clipboard.db").exists() {
                    println!("Migrating database to custom cache path: {:?}", cp);
                    let _ = std::fs::copy(app_data.join("clipboard.db"), cp.join("clipboard.db"));
                    let _ = std::fs::copy(app_data.join("clipboard.db-shm"), cp.join("clipboard.db-shm"));
                    let _ = std::fs::copy(app_data.join("clipboard.db-wal"), cp.join("clipboard.db-wal"));
                }
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
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            simulate_paste,
            commands::ingest_clipboard,
            commands::read_clipboard_files,
            commands::get_active_window,
            commands::load_history,
            commands::toggle_pin,
            commands::delete_item,
            commands::set_tags,
            commands::mark_used,
            commands::get_config,
            commands::set_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
