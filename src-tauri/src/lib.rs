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

            let db_path = app_data.join("clipboard.db");
            let pool = tauri::async_runtime::block_on(async {
                let pool = db::open_pool(&db_path).await?;
                db::ensure_schema(&pool).await?;
                Ok::<_, sqlx::Error>(pool)
            })?;
            app.manage(db::AppState { pool });
            Ok(())
        })
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
            commands::mark_used
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
