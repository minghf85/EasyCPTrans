//! Memory housekeeping for the hidden panel.
//!
//! EasyCPTrans is a tray app: the panel is hidden most of the time, but both the
//! Rust process and the WebView2 renderer keep whatever heap they reached while
//! it was last visible. Copying images is the expensive case — several megabytes
//! of base64 and a full decoded bitmap pass through both processes — and neither
//! one returns those pages to the OS on its own.
//!
//! Two mechanisms are used here, both documented by their vendor:
//!
//! - `ICoreWebView2_19::SetMemoryUsageTargetLevel` is WebView2's official switch
//!   for "this webview is not in use, release caches". It is set to `Low` when the
//!   panel hides and `Normal` before it is shown again.
//! - `EmptyWorkingSet` trims the Rust process' working set once the panel has
//!   been hidden for a while. It does not free the heap (the allocations are still
//!   owned by the process), but it hands the physical pages back to Windows, which
//!   is what Task Manager's "Memory" column reports and what the memory chip in
//!   the header shows.
//!
//! Keep the delay: trimming while the panel is still visible just makes the next
//! paint fault the same pages back in.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};

/// How long the panel must stay hidden before the working set is trimmed.
const IDLE_TRIM_DELAY: Duration = Duration::from_secs(3);

/// Coalesces bursts of trim requests (one per clipboard ingest) into one trim.
static TRIM_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Sets WebView2's memory usage target level.
///
/// Fails silently on runtimes older than 1.0.1518.46, where the interface is not
/// present: the memory is then simply not released early.
#[cfg(windows)]
fn set_webview_memory_level<R: Runtime>(window: &WebviewWindow<R>, low: bool) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
    };
    use windows::core::Interface;

    let _ = window.with_webview(move |webview| {
        let controller = webview.controller();
        unsafe {
            let Ok(core) = controller.CoreWebView2() else {
                return;
            };
            let Ok(core) = core.cast::<ICoreWebView2_19>() else {
                return;
            };
            let level = if low {
                COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
            } else {
                COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
            };
            let _ = core.SetMemoryUsageTargetLevel(level);
        }
    });
}

#[cfg(not(windows))]
fn set_webview_memory_level<R: Runtime>(_window: &WebviewWindow<R>, _low: bool) {}

#[cfg(windows)]
fn trim_working_set_once() {
    use windows::Win32::System::ProcessStatus::EmptyWorkingSet;
    use windows::Win32::System::Threading::GetCurrentProcess;

    unsafe {
        let _ = EmptyWorkingSet(GetCurrentProcess());
    }
}

#[cfg(not(windows))]
fn trim_working_set_once() {}

/// Hides the panel and starts the deferred memory release.
pub(crate) fn hide_window<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    window.hide()?;
    set_webview_memory_level(window, true);
    schedule_idle_trim(window.app_handle().clone());
    Ok(())
}

/// Shows the panel and lifts WebView2 back to its normal memory budget.
pub(crate) fn show_window<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    // A trim queued while hidden must not fire after the panel is visible again.
    TRIM_GENERATION.fetch_add(1, Ordering::SeqCst);
    set_webview_memory_level(window, false);
    window.show()
}

/// Schedules one working-set trim, but only if the panel is still hidden by then.
///
/// Calls are coalesced: a burst of ingests only arms a single trim. The helper is
/// safe to call while the panel is visible — the check happens after the delay,
/// and a visible panel is left untouched.
pub(crate) fn schedule_idle_trim<R: Runtime>(app: AppHandle<R>) {
    let generation = TRIM_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(IDLE_TRIM_DELAY).await;
        if TRIM_GENERATION.load(Ordering::SeqCst) != generation {
            return;
        }
        let Some(window) = app.get_webview_window("main") else {
            return;
        };
        if window.is_visible().unwrap_or(true) {
            return;
        }
        // OCR holds the largest buffers in the app. Let it finish; its own
        // completion path schedules the trim that will actually stick.
        if crate::ocr::auto_ocr_busy() {
            return;
        }
        set_webview_memory_level(&window, true);
        trim_working_set_once();
        println!("[EasyCPTrans] Released memory while the panel is hidden");
    });
}

/// Front-end entry point for the two places that hide the panel directly.
#[tauri::command]
pub fn hide_main_window(app: AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    hide_window(&window).map_err(|err| err.to_string())
}
