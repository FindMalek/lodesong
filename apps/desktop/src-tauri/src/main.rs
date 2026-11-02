#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, path::PathBuf};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder,
};

fn config_file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join("server.txt"))
}

fn saved_server(app: &AppHandle) -> Option<Url> {
    fs::read_to_string(config_file(app)?).ok()?.trim().parse().ok()
}

/// The first-run page in `../src`, served by the app itself.
fn setup_page() -> Url {
    let origin = if cfg!(windows) { "http://tauri.localhost/" } else { "tauri://localhost/" };
    origin.parse().expect("static url")
}

fn navigate(app: &AppHandle, url: Url) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("no window")?;
    window.navigate(url).map_err(|error| error.to_string())
}

/// Called by the first-run page: remember the address and open it in this window.
#[tauri::command]
fn set_server(app: AppHandle, address: String) -> Result<(), String> {
    let url: Url = address.parse().map_err(|_| "not an address".to_string())?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("not an address".into());
    }
    let file = config_file(&app).ok_or("no config folder")?;
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    }
    fs::write(&file, url.as_str()).map_err(|error| error.to_string())?;
    navigate(&app, url)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![set_server])
        .setup(|app| {
            let target = match saved_server(app.handle()) {
                Some(url) => WebviewUrl::External(url),
                None => WebviewUrl::App("index.html".into()),
            };
            WebviewWindowBuilder::new(app, "main", target)
                .title("lodesong")
                .inner_size(1200.0, 800.0)
                .min_inner_size(360.0, 480.0)
                .build()?;

            let reload = MenuItemBuilder::with_id("reload", "Reload").accelerator("CmdOrCtrl+R").build(app)?;
            let change = MenuItemBuilder::with_id("change", "Change server").build(app)?;
            let quit = PredefinedMenuItem::quit(app, Some("Quit"))?;
            let menu = SubmenuBuilder::new(app, "lodesong").item(&reload).item(&change).separator().item(&quit).build()?;
            app.set_menu(MenuBuilder::new(app).item(&menu).build()?)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let Some(window) = app.get_webview_window("main") else { return };
            match event.id().as_ref() {
                "reload" => {
                    let _ = window.eval("location.reload()");
                }
                "change" => {
                    if let Some(file) = config_file(app) {
                        let _ = fs::remove_file(file);
                    }
                    let _ = window.navigate(setup_page());
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("lodesong failed to start");
}
