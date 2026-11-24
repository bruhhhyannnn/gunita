//! Gunita for Windows.
//!
//! The app shows the live Gunita website in its own window (so it updates with
//! every deploy and keeps working offline through the site's service worker) and
//! adds what a browser tab can't: a tray icon, a global quick-capture hotkey,
//! start with Windows, and Google sign-in through your normal browser.
//!
//! The website gets no native commands. The app talks to it only by dispatching
//! DOM events (`gunita:capture`, `gunita:navigate`), see `src/lib/desktop.ts`.

use std::sync::Mutex;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::RngCore;
use sha2::{Digest, Sha256};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as _};
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

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Gunita", true, None::<&str>)?;
    let capture = MenuItem::with_id(app, "capture", "Quick capture (Ctrl+Shift+Space)", true, None::<&str>)?;
    let today = MenuItem::with_id(app, "today", "Start today", true, None::<&str>)?;
    let autostart_on = app.autolaunch().is_enabled().unwrap_or(false);
    let autostart = CheckMenuItem::with_id(app, "autostart", "Start with Windows", true, autostart_on, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Gunita", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &capture,
            &today,
            &PredefinedMenuItem::separator(app)?,
            &autostart,
            &PredefinedMenuItem::separator(app)?,
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
                let _ = autostart.set_checked(launcher.is_enabled().unwrap_or(!enabled));
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
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                // Remember size and position, but let --hidden decide visibility.
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .manage(SignIn::default())
        .setup(|app| {
            let hidden = std::env::args().any(|a| a == "--hidden");
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
