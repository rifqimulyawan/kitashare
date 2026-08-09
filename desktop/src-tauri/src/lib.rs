#[cfg(debug_assertions)]
use tauri::Manager;

mod capture;
mod server;
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::ShareState::default())
        .setup(|_app| {
            #[cfg(debug_assertions)]
            {
                let window = _app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::start_sharing,
            commands::stop_sharing,
            commands::get_session_info,
            commands::get_local_ip,
            commands::get_available_displays,
            commands::share_files,
            commands::get_shared_files,
            commands::clear_files,
            commands::remove_file,
            commands::start_internet_sharing,
            commands::get_internet_relay_url,
            commands::update_internet_profile,
            commands::update_host_profile,
            commands::send_chat,
        ])
        .run(tauri::generate_context!())
        .expect("error while running KitaShare");
}
