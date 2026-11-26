//! Gunita for Windows.
//!
//! The app shows the live Gunita website in its own window (so it updates with
//! every deploy and keeps working offline through the site's service worker) and
//! adds what a browser tab can't: a tray icon, a global quick-capture hotkey,
//! opening when Windows starts (on by default), updating itself from signed
//! GitHub releases, and Google sign-in through your normal browser.
//!
//! The website gets no native commands. The app talks to it only by dispatching
//! DOM events (`gunita:capture`, `gunita:navigate`), see `src/lib/desktop.ts`.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::RngCore;
use sha2::{Digest, Sha256};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as _};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::{Update, UpdaterExt};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

/// Where the app lives. Override at build time with the GUNITA_URL environment variable.
const DEFAULT_URL: &str = "https://gunita.bruhhyannn.workers.dev";
const MAIN: &str = "main";

/// Runs in the page before the site's own scripts.
const INIT_SCRIPT: &str = r#"
(function () {
  window.__GUNITA_DESKTOP__ = true;
  // Links to other websites open in your normal browser instead of inside the app.
  function external(href) {
    try {
      var url = new URL(href, location.href);
      return url.origin !== location.origin && /^(https?|mailto):$/.test(url.protocol) ? url.href : null;
    } catch (_) {
      return null;
    }
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || a.hasAttribute('download')) return;
    var href = external(a.getAttribute('href'));
    if (href) {
      e.preventDefault();
      e.stopPropagation();
      location.href = href; // the app catches this navigation and opens the browser
    }
  }, true);
  var open = window.open;
  window.open = function (u) {
    var href = u ? external(String(u)) : null;
    if (href) {
      location.href = href;
      return null;
    }
    return open.apply(window, arguments);
  };
})();
"#;

fn app_url() -> Url {
    Url::parse(option_env!("GUNITA_URL").unwrap_or(DEFAULT_URL)).expect("GUNITA_URL must be a valid URL")
}

/// The secret half of the sign-in handoff. Only this process knows it.
#[derive(Default)]
struct SignIn {
    verifier: Mutex<Option<String>>,
}

fn random_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn challenge_for(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(MAIN)
}

fn show_main(app: &AppHandle) {
    if let Some(w) = main_window(app) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn dispatch(app: &AppHandle, js: &str) {
    if let Some(w) = main_window(app) {
        let _ = w.eval(js);
    }
}

fn quick_capture(app: &AppHandle) {
    show_main(app);
    dispatch(app, "window.dispatchEvent(new Event('gunita:capture'))");
}

fn go_to(app: &AppHandle, path: &str) {
    show_main(app);
    let detail = serde_json::to_string(path).unwrap_or_else(|_| "\"/\"".into());
    dispatch(app, &format!("window.dispatchEvent(new CustomEvent('gunita:navigate', {{ detail: {detail} }}))"));
}

/// Google blocks sign-in inside apps, so we open the system browser with a
/// one-time challenge. The site sends us back a code via a gunita:// link.
fn start_sign_in(app: &AppHandle, requested: &Url) {
    let verifier = random_token();
    let challenge = challenge_for(&verifier);
    if let Ok(mut slot) = app.state::<SignIn>().verifier.lock() {
        *slot = Some(verifier);
    }
    let mut target = app_url();
    target.set_path("/api/auth/google");
    {
        let mut q = target.query_pairs_mut();
        q.clear();
        q.append_pair("client", "desktop");
        q.append_pair("challenge", &challenge);
        if let Some((_, mode)) = requested.query_pairs().find(|(k, _)| k == "mode") {
            q.append_pair("mode", &mode);
        }
    }
    let _ = app.opener().open_url(target.as_str(), None::<&str>);
}

fn handle_deep_link(app: &AppHandle, url: &Url) {
    if url.scheme() != "gunita" {
        return;
    }
    match url.host_str() {
        Some("auth") => {
            let code = url.query_pairs().find(|(k, _)| k == "code").map(|(_, v)| v.into_owned());
            let verifier = app.state::<SignIn>().verifier.lock().ok().and_then(|mut v| v.take());
            if let (Some(code), Some(verifier), Some(w)) = (code, verifier, main_window(app)) {
                let mut target = app_url();
                target.set_path("/api/auth/desktop");
                target.query_pairs_mut().clear().append_pair("code", &code).append_pair("verifier", &verifier);
                let _ = w.navigate(target);
            }
            show_main(app);
        }
        Some("calendar") => {
            // Reload so the app picks up the new connection.
            if let Some(w) = main_window(app) {
                let mut target = app_url();
                target.set_path("/settings");
                let _ = w.navigate(target);
            }
            show_main(app);
        }
        _ => show_main(app),
    }
}

// ---------- Desktop preferences (a small JSON file next to the app's settings) ----------

/// The command-line flag Windows starts Gunita with at login.
const AT_LOGIN: &str = "--autostart";

fn prefs_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("desktop.json"))
}

fn load_prefs(app: &AppHandle) -> serde_json::Value {
    prefs_path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}))
}

fn pref(app: &AppHandle, key: &str) -> bool {
    load_prefs(app).get(key).and_then(|v| v.as_bool()).unwrap_or(false)
}

fn set_pref(app: &AppHandle, key: &str, value: bool) {
    let Some(path) = prefs_path(app) else { return };
    let mut prefs = load_prefs(app);
    prefs[key] = serde_json::Value::Bool(value);
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(path, prefs.to_string());
}

/// The first time this version runs, turn on "Start with Windows" (you can
/// turn it off from the tray; that choice is kept).
fn set_up_autostart(app: &AppHandle) {
    if pref(app, "autostartSetUp") {
        return;
    }
    let _ = app.autolaunch().enable();
    set_pref(app, "autostartSetUp", true);
}

// ---------- Updates (signed releases on GitHub, see .github/workflows/desktop.yml) ----------

/// A downloaded update waiting for a restart, and whether a check is running.
#[derive(Default)]
struct Updates {
    pending: Mutex<Option<(Update, Vec<u8>)>>,
    asked: Mutex<Option<String>>,
    busy: AtomicBool,
}

/// The tray's "Check for updates…" / "Restart to update" item.
struct UpdateItem(MenuItem<tauri::Wry>);

fn info(app: &AppHandle, title: &str, text: &str) {
    app.dialog().message(text).title(title).kind(MessageDialogKind::Info).show(|_| {});
}

/// Checks GitHub for a newer version and downloads it in the background.
/// `interactive`: you asked from the tray, so say so if there's nothing new.
fn check_updates(app: AppHandle, interactive: bool) {
    if app.state::<Updates>().busy.swap(true, Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let found = match app.updater() {
            Ok(updater) => updater.check().await,
            Err(e) => Err(e),
        };
        match found {
            Ok(Some(update)) => {
                let version = update.version.clone();
                match update.download(|_, _| {}, || {}).await {
                    Ok(bytes) => {
                        *app.state::<Updates>().pending.lock().unwrap() = Some((update, bytes));
                        if let Some(item) = app.try_state::<UpdateItem>() {
                            let _ = item.0.set_text(format!("Restart to update to {version}"));
                        }
                        ask_to_restart(&app, &version, interactive);
                    }
                    Err(e) if interactive => info(&app, "Couldn't download the update", &e.to_string()),
                    Err(e) => eprintln!("update download failed: {e}"),
                }
            }
            Ok(None) if interactive => info(
                &app,
                "Gunita is up to date",
                &format!("You have the latest version ({}).", app.package_info().version),
            ),
            Ok(None) => {}
            Err(e) if interactive => info(&app, "Couldn't check for updates", &e.to_string()),
            Err(e) => eprintln!("update check failed: {e}"),
        }
        app.state::<Updates>().busy.store(false, Ordering::SeqCst);
    });
}

/// "Gunita 0.3.1 is ready. Restart now?" (once per version, unless you asked).
fn ask_to_restart(app: &AppHandle, version: &str, always: bool) {
    {
        let updates = app.state::<Updates>();
        let mut asked = updates.asked.lock().unwrap();
        if !always && asked.as_deref() == Some(version) {
            return;
        }
        *asked = Some(version.to_string());
    }
    let handle = app.clone();
    app.dialog()
        .message(format!(
            "Gunita {version} is ready to install. Restart now to update? Your notes are safe either way.\n\nLater: it stays in the tray menu as \"Restart to update\"."
        ))
        .title("Update ready")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom("Restart now".into(), "Later".into()))
        .show(move |restart| {
            if restart {
                install_update(&handle);
            }
        });
}

/// Installs the downloaded update. On Windows the installer runs quietly and
/// opens Gunita again when it's done.
fn install_update(app: &AppHandle) {
    let Some((update, bytes)) = app.state::<Updates>().pending.lock().unwrap().take() else {
        check_updates(app.clone(), true);
        return;
    };
    let _ = app.save_window_state(StateFlags::all());
    match update.install(bytes) {
        Ok(()) => app.restart(),
        Err(e) => info(app, "Couldn't install the update", &e.to_string()),
    }
}

/// Checks shortly after start (the network may not be up right at login), then every 6 hours.
fn schedule_update_checks(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(20));
        loop {
            check_updates(app.clone(), false);
            std::thread::sleep(Duration::from_secs(6 * 60 * 60));
        }
    });
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Gunita", true, None::<&str>)?;
    let capture = MenuItem::with_id(app, "capture", "Quick capture (Ctrl+Shift+Space)", true, None::<&str>)?;
    let today = MenuItem::with_id(app, "today", "Start today", true, None::<&str>)?;
    let autostart_on = app.autolaunch().is_enabled().unwrap_or(false);
    let autostart = CheckMenuItem::with_id(app, "autostart", "Start with Windows", true, autostart_on, None::<&str>)?;
    let in_tray = pref(app.handle(), "startInTray");
    let tray_start = CheckMenuItem::with_id(app, "trayStart", "Start in the tray (no window)", autostart_on, in_tray, None::<&str>)?;
    let update = MenuItem::with_id(app, "update", "Check for updates…", true, None::<&str>)?;
    app.manage(UpdateItem(update.clone()));
    let quit = MenuItem::with_id(app, "quit", "Quit Gunita", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &capture,
            &today,
            &PredefinedMenuItem::separator(app)?,
            &autostart,
            &tray_start,
            &PredefinedMenuItem::separator(app)?,
            &update,
            &quit,
        ],
    )?;

    let mut tray = TrayIconBuilder::with_id("tray")
        .tooltip("Gunita")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "capture" => quick_capture(app),
            "today" => go_to(app, "/?start=today"),
            "autostart" => {
                let launcher = app.autolaunch();
                let enabled = launcher.is_enabled().unwrap_or(false);
                let _ = if enabled { launcher.disable() } else { launcher.enable() };
                let now = launcher.is_enabled().unwrap_or(!enabled);
                let _ = autostart.set_checked(now);
                let _ = tray_start.set_enabled(now);
            }
            "update" => {
                if app.state::<Updates>().pending.lock().unwrap().is_some() {
                    install_update(app);
                } else {
                    check_updates(app.clone(), true);
                }
            }
            "trayStart" => {
                let next = !pref(app, "startInTray");
                set_pref(app, "startInTray", next);
                let _ = tray_start.set_checked(next);
            }
            "quit" => {
                let _ = app.save_window_state(StateFlags::all());
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must come first: a second launch (or a gunita:// link) goes to the running app.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| show_main(app)))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![AT_LOGIN])))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(Updates::default())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                // Remember size and position, but let --hidden decide visibility.
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .manage(SignIn::default())
        .setup(|app| {
            set_up_autostart(app.handle());
            // Started by Windows at login ("--hidden" is what older versions registered):
            // open the window, unless you chose "Start in the tray".
            let at_login = std::env::args().any(|a| a == AT_LOGIN || a == "--hidden");
            let hidden = at_login && pref(app.handle(), "startInTray");
            let origin = app_url();
            let handle = app.handle().clone();

            let window = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::External(origin.clone()))
                .title("Gunita")
                .inner_size(1280.0, 840.0)
                .min_inner_size(420.0, 480.0)
                .visible(!hidden)
                .initialization_script(INIT_SCRIPT)
                // The page sets titles like "☀️ Work TODO – Gunita"; show them on the taskbar too.
                .on_document_title_changed(|window, title| {
                    let _ = window.set_title(if title.trim().is_empty() { "Gunita" } else { &title });
                })
                .on_navigation(move |url| match url.scheme() {
                    "about" | "blob" | "data" => true,
                    "http" | "https" if url.origin() == origin.origin() => {
                        if url.path() == "/api/auth/google" {
                            start_sign_in(&handle, url);
                            false
                        } else {
                            true
                        }
                    }
                    "http" | "https" | "mailto" => {
                        let _ = handle.opener().open_url(url.as_str(), None::<&str>);
                        false
                    }
                    _ => false,
                })
                .build()?;

            // Closing the window keeps Gunita running in the tray, so the hotkey still works.
            let w = window.clone();
            window.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = w.hide();
                }
            });

            build_tray(app)?;
            schedule_update_checks(app.handle().clone());

            let capture = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(move |app, shortcut, event| {
                        if shortcut == &capture && event.state() == ShortcutState::Pressed {
                            quick_capture(app);
                        }
                    })
                    .build(),
            )?;
            if let Err(e) = app.global_shortcut().register(capture) {
                eprintln!("Could not register Ctrl+Shift+Space (another app may use it): {e}");
            }

            // gunita:// links (sign-in and calendar handoff from the browser).
            #[cfg(any(windows, target_os = "linux"))]
            {
                let _ = app.deep_link().register_all();
            }
            let links = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    handle_deep_link(&links, &url);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Gunita");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn challenge_matches_server_sha256_base64url() {
        // Server: sha256() in src/server/util.ts = base64url(SHA-256(text)) without padding.
        assert_eq!(challenge_for("abc"), "ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0");
    }

    #[test]
    fn tokens_are_43_url_safe_chars() {
        let t = random_token();
        assert_eq!(t.len(), 43);
        assert!(t.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
        assert_ne!(t, random_token());
    }
}
