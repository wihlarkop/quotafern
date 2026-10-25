use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
use tauri::{Manager, WebviewWindow, WindowEvent};

use codex::CodexBridge;

mod codex;
mod popup;

const FOCUS_LOSS_RACE_WINDOW: Duration = Duration::from_millis(250);

#[derive(Default)]
struct LastTrayAnchor(Mutex<Option<popup::TrayAnchor>>);

impl LastTrayAnchor {
    fn remember(&self, anchor: Option<popup::TrayAnchor>) {
        if let Ok(mut stored) = self.0.lock() {
            *stored = anchor;
        }
    }

    fn get(&self) -> Option<popup::TrayAnchor> {
        self.0.lock().ok().and_then(|stored| *stored)
    }
}

#[derive(Default)]
struct TrayIconHandle(Mutex<Option<tauri::tray::TrayIcon>>);

impl TrayIconHandle {
    fn remember(&self, tray: tauri::tray::TrayIcon) {
        if let Ok(mut stored) = self.0.lock() {
            *stored = Some(tray);
        }
    }

    fn current_anchor(&self) -> Option<popup::TrayAnchor> {
        let tray = self.0.lock().ok().and_then(|stored| stored.clone())?;
        tray.rect()
            .ok()
            .flatten()
            .and_then(popup::TrayAnchor::from_rect)
    }
}

#[derive(Default)]
struct WindowFocusHistory(Mutex<FocusHistory>);

#[derive(Default)]
struct FocusHistory {
    focused: bool,
    lost_focus_at: Option<Instant>,
    pointer_in_tray: bool,
    focused_at_tray_entry: bool,
}

impl WindowFocusHistory {
    fn record(&self, focused: bool) {
        if let Ok(mut history) = self.0.lock() {
            if focused {
                history.lost_focus_at = None;
                if history.pointer_in_tray {
                    history.focused_at_tray_entry = true;
                }
            } else if history.focused && history.pointer_in_tray && history.focused_at_tray_entry {
                history.lost_focus_at = Some(Instant::now());
            } else {
                history.lost_focus_at = None;
            }
            history.focused = focused;
        }
    }

    fn record_tray_pointer(&self, inside: bool, focused: bool) {
        if let Ok(mut history) = self.0.lock() {
            if inside && !history.pointer_in_tray {
                history.focused_at_tray_entry = focused;
            }
            history.pointer_in_tray = inside;
            if !inside {
                history.lost_focus_at = None;
                history.focused_at_tray_entry = false;
            }
        }
    }

    fn was_focused_for_tray_click(&self) -> bool {
        self.0.lock().ok().is_some_and(|mut history| {
            let recent_loss = history.lost_focus_at.take();
            history.focused
                || (history.pointer_in_tray
                    && history.focused_at_tray_entry
                    && recent_loss.is_some_and(|at| at.elapsed() <= FOCUS_LOSS_RACE_WINDOW))
        })
    }
}

#[tauri::command]
fn hide_popup(window: WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("hide_popup is only available to the main window".to_owned());
    }

    window
        .hide()
        .map_err(|error| format!("could not hide the main window: {error}"))
}

fn show_main_window(app: &tauri::AppHandle, anchor: Option<popup::TrayAnchor>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        popup::place(&window, anchor);
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn current_tray_anchor(app: &tauri::AppHandle) -> Option<popup::TrayAnchor> {
    app.state::<TrayIconHandle>()
        .current_anchor()
        .or_else(|| app.state::<LastTrayAnchor>().get())
}

fn toggle_main_window(app: &tauri::AppHandle, anchor: Option<popup::TrayAnchor>) {
    if let Some(window) = app.get_webview_window("main") {
        let is_visible = window.is_visible().unwrap_or(false);
        let focus_history = app.state::<WindowFocusHistory>();
        let was_focused = window.is_focused().unwrap_or(false)
            || (is_visible && focus_history.was_focused_for_tray_click());

        if is_visible && was_focused {
            let _ = window.hide();
        } else {
            show_main_window(app, anchor);
        }
    }
}

fn hide_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

fn tray_icon() -> Image<'static> {
    // White glyph: owner-selected fixed fallback for dark taskbars. Window theme
    // does not reliably describe the Windows/Linux tray background.
    Image::from_bytes(include_bytes!("../icons/tray/fern-dark-32.png"))
        .expect("the embedded Quotafern tray icon must be valid PNG")
}

pub fn run() {
    let builder = tauri::Builder::default()
        .manage(CodexBridge::default())
        .manage(LastTrayAnchor::default())
        .manage(TrayIconHandle::default())
        .manage(WindowFocusHistory::default());
    // Rust-only native confirmation. No renderer capability. Headless unit
    // tests install only their compile-time trusted presenter, never OS dialogs.
    #[cfg(not(test))]
    let builder = builder.plugin(tauri_plugin_dialog::init());
    let app = builder
        // Prevent duplicate processes and duplicate tray icons. A repeated
        // launch brings the existing, single popup back into view.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let anchor = current_tray_anchor(app);
            show_main_window(app, anchor);
        }))
        .invoke_handler(tauri::generate_handler![
            hide_popup,
            codex::codex_connect,
            codex::codex_refresh,
            codex::codex_disconnect,
            codex::codex_status
        ])
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }

                match event {
                    WindowEvent::Focused(focused) => {
                        window.state::<WindowFocusHistory>().record(*focused);
                    }
                    WindowEvent::Resized(size) if size.width == 0 || size.height == 0 => {}
                    WindowEvent::ScaleFactorChanged { .. }
                    | WindowEvent::Moved(_)
                    | WindowEvent::Resized(_) => {
                        // Recompute against connected work areas after DPI/display changes. A
                        // normal focus loss is deliberately not a dismissal signal: native menus
                        // and settings controls may take focus without closing the popup.
                        if let Some(main_window) = window.app_handle().get_webview_window("main") {
                            popup::keep_on_screen(&main_window);
                        }
                    }
                    _ => {}
                }
            }
        })
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Show Quotafern", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "Hide Quotafern", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &hide, &quit])?;
            let app_handle = app.handle().clone();

            let tray = TrayIconBuilder::new()
                .icon(tray_icon())
                // AppKit handles menu-bar contrast from the approved glyph alpha.
                .icon_as_template(cfg!(target_os = "macos"))
                .tooltip("Quotafern")
                .menu(&menu)
                // Windows and macOS use a primary click for popup toggling. Linux tray
                // implementations do not reliably emit click events, so keep the menu fallback.
                .show_menu_on_left_click(!cfg!(any(target_os = "windows", target_os = "macos")))
                .on_tray_icon_event(move |_tray, event| {
                    let focus_history = app_handle.state::<WindowFocusHistory>();
                    match &event {
                        TrayIconEvent::Enter { .. } | TrayIconEvent::Move { .. } => {
                            let focused = app_handle
                                .get_webview_window("main")
                                .is_some_and(|window| window.is_focused().unwrap_or(false));
                            focus_history.record_tray_pointer(true, focused);
                        }
                        TrayIconEvent::Leave { .. } => {
                            focus_history.record_tray_pointer(false, false);
                        }
                        _ => {}
                    }
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Down,
                        rect,
                        ..
                    } = event
                    {
                        let anchor = popup::TrayAnchor::from_rect(rect);
                        app_handle.state::<LastTrayAnchor>().remember(anchor);

                        if cfg!(any(target_os = "windows", target_os = "macos")) {
                            toggle_main_window(&app_handle, anchor);
                        }
                    }
                })
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        let anchor = current_tray_anchor(app);
                        show_main_window(app, anchor);
                    }
                    "hide" => hide_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            let initial_anchor = tray
                .rect()
                .ok()
                .flatten()
                .and_then(popup::TrayAnchor::from_rect);
            app.state::<LastTrayAnchor>().remember(initial_anchor);
            app.state::<TrayIconHandle>().remember(tray);
            if let Some(main_window) = app.get_webview_window("main") {
                app.state::<WindowFocusHistory>()
                    .record(main_window.is_focused().unwrap_or(false));
                if initial_anchor.is_some() {
                    popup::place(&main_window, initial_anchor);
                } else {
                    popup::keep_on_screen(&main_window);
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Quotafern");
    app.run(|app, event| {
        if matches!(
            event,
            tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
        ) {
            if let Some(bridge) = app.try_state::<CodexBridge>() {
                bridge.shutdown();
            }
        }
    });
}

#[cfg(test)]
mod focus_regression {
    use super::{WindowFocusHistory, FOCUS_LOSS_RACE_WINDOW};
    use std::time::Instant;

    #[test]
    fn switching_apps_away_from_tray_does_not_become_a_toggle() {
        let history = WindowFocusHistory::default();
        history.record(true);
        history.record(false);
        history.record_tray_pointer(true, false);
        assert!(!history.was_focused_for_tray_click());
    }

    #[test]
    fn tray_focus_ordering_is_bounded_and_cleared_on_pointer_exit() {
        let history = WindowFocusHistory::default();
        // Opening from a hidden popup must allow the next click to toggle even
        // if the pointer never leaves the tray icon between the two clicks.
        history.record_tray_pointer(true, false);
        history.record(true);
        history.record(false);
        assert!(history.was_focused_for_tray_click());
        assert!(!history.was_focused_for_tray_click());
        history.record(true);
        history.record(false);
        history.record_tray_pointer(false, false);
        assert!(!history.was_focused_for_tray_click());

        history.record_tray_pointer(true, true);
        history.0.lock().unwrap().lost_focus_at = Some(Instant::now() - FOCUS_LOSS_RACE_WINDOW * 2);
        assert!(!history.was_focused_for_tray_click());
    }
}
