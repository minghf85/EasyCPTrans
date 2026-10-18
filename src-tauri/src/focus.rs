//! Handing the keyboard back to the application the panel was opened from.
//!
//! Pasting is "load the clipboard, then send Ctrl+V to whatever has focus", so
//! the keystroke only lands if the panel has already let go of focus. Hiding the
//! panel is one way to make that happen, but a panel pinned on top has to stay
//! visible — so instead the window that had focus when the panel was shown is
//! remembered and put back before typing.
//!
//! The previous implementation hid the panel and then slept for a fixed 90ms.
//! That is a guess: the window manager hands focus over asynchronously, so on a
//! slow handover the keystroke went nowhere. Waiting is now explicit.

use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::Manager;

/// Upper bound on waiting for a focus handover. Long enough to cover a busy
/// window manager, short enough that a failed paste still reports promptly.
const FOCUS_TIMEOUT: Duration = Duration::from_millis(600);
const FOCUS_POLL: Duration = Duration::from_millis(10);

/// The last window seen in the foreground that was not the panel itself.
static PREVIOUS_FOCUS: Mutex<Option<isize>> = Mutex::new(None);

/// Whether a candidate handle is worth remembering.
///
/// Two cases have to be refused: a null handle (nothing was focused), and the
/// panel itself — otherwise the panel would learn to paste into its own window.
fn should_remember(handle: isize, own_panel: Option<isize>) -> bool {
    handle != 0 && own_panel != Some(handle)
}

/// Records the foreign window that currently has focus. Call this immediately
/// before showing and focusing the panel.
pub(crate) fn remember_foreground_window(own_panel: Option<isize>) {
    let handle = imp::foreground_handle();
    if !should_remember(handle, own_panel) {
        return;
    }
    if let Ok(mut slot) = PREVIOUS_FOCUS.lock() {
        *slot = Some(handle);
    }
}

fn previous_handle() -> Option<isize> {
    PREVIOUS_FOCUS.lock().ok().and_then(|slot| *slot)
}

/// Native handle of the panel, where the platform has one.
#[cfg(target_os = "windows")]
pub(crate) fn native_handle<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) -> Option<isize> {
    window.hwnd().ok().map(|handle| handle.0 as isize)
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn native_handle<R: tauri::Runtime>(_window: &tauri::WebviewWindow<R>) -> Option<isize> {
    None
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PasteOutcome {
    /// The Ctrl+V keystroke was sent.
    pub sent: bool,
    /// The panel stopped being the foreground window before the keystroke, so
    /// the keystroke reached another application.
    pub focus_moved: bool,
    /// Focus had to be moved by hand because the panel stayed visible.
    pub restored_focus: bool,
}

/// Puts focus back where the user was and sends Ctrl+V.
///
/// `hide_panel` is what an ordinary (not pinned) panel wants: hiding it is the
/// most reliable way to give focus back. A pinned panel passes `false`, and focus
/// is restored to the remembered window instead so the panel stays on screen.
#[tauri::command]
pub async fn paste_to_previous_window(
    app: tauri::AppHandle,
    hide_panel: bool,
) -> Result<PasteOutcome, String> {
    let panel = app.get_webview_window("main");

    let mut restored_focus = false;
    if hide_panel {
        if let Some(window) = &panel {
            crate::memory::hide_window(window).map_err(|err| err.to_string())?;
        }
    } else if let Some(tracked) = previous_handle().filter(|handle| imp::is_live(*handle)) {
        restored_focus = imp::activate(tracked);
    }

    let panel_handle = panel.as_ref().and_then(native_handle);

    // Polling and the keystroke itself are blocking work, so they stay off the
    // async worker.
    tauri::async_runtime::spawn_blocking(move || {
        let focus_moved = imp::wait_until_not_foreground(panel_handle, FOCUS_TIMEOUT);
        crate::simulate_paste_impl();
        PasteOutcome {
            sent: true,
            focus_moved,
            restored_focus,
        }
    })
    .await
    .map_err(|err| err.to_string())
}

#[cfg(target_os = "windows")]
mod imp {
    use super::{Duration, Instant, FOCUS_POLL};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, IsWindow, SetForegroundWindow,
    };

    pub(super) fn foreground_handle() -> isize {
        unsafe { GetForegroundWindow().0 as isize }
    }

    pub(super) fn is_live(handle: isize) -> bool {
        handle != 0 && unsafe { IsWindow(Some(HWND(handle as *mut _))).as_bool() }
    }

    pub(super) fn activate(handle: isize) -> bool {
        // The panel is the foreground process at the moment of this call, which
        // is exactly the condition Windows requires to allow the handover.
        unsafe { SetForegroundWindow(HWND(handle as *mut _)).as_bool() }
    }

    /// Waits for the panel to stop being the foreground window.
    ///
    /// Returns `false` on timeout, which is the signal that the keystroke is
    /// about to be typed into the panel itself and the user should be told.
    pub(super) fn wait_until_not_foreground(panel: Option<isize>, timeout: Duration) -> bool {
        let Some(panel) = panel else {
            return true;
        };

        let deadline = Instant::now() + timeout;
        loop {
            if foreground_handle() != panel {
                return true;
            }
            if Instant::now() >= deadline {
                return false;
            }
            std::thread::sleep(FOCUS_POLL);
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    use super::{Duration, Instant};

    pub(super) fn foreground_handle() -> isize {
        0
    }

    pub(super) fn is_live(_handle: isize) -> bool {
        false
    }

    pub(super) fn activate(_handle: isize) -> bool {
        false
    }

    /// Other platforms hand focus over when the panel is hidden, which is the
    /// only path this app uses there.
    pub(super) fn wait_until_not_foreground(_panel: Option<isize>, _timeout: Duration) -> bool {
        std::thread::sleep(Duration::from_millis(80));
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_a_null_handle() {
        assert!(!should_remember(0, Some(42)));
        assert!(!should_remember(0, None));
    }

    #[test]
    fn refuses_the_panel_itself() {
        // Pasting into our own window is the failure this guards against.
        assert!(!should_remember(42, Some(42)));
    }

    #[test]
    fn remembers_any_other_window() {
        assert!(should_remember(7, Some(42)));
        assert!(should_remember(7, None));
    }

    #[test]
    fn starts_with_no_previous_window() {
        assert_eq!(previous_handle(), None);
    }

    #[test]
    fn the_panel_handle_never_replaces_the_remembered_one() {
        remember_foreground_window(Some(imp::foreground_handle()));
        assert_eq!(previous_handle(), None);
    }
}
