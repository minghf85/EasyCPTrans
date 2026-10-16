//! Foreground-window identification and source-application icon extraction.
//!
//! Icons come back as raw RGBA bytes plus their dimensions; the frontend turns
//! that into a data URL through a canvas. Keeping the conversion on the webview
//! side means the Rust build needs no image encoder dependency.

use std::collections::HashMap;
use std::sync::Mutex;

use once_cell::sync::Lazy;
use serde::Serialize;

/// Shell icons are small; a handful of distinct source apps covers a session.
const MAX_CACHE_ENTRIES: usize = 64;

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveWindowInfo {
    /// Raw window title, e.g. `"notes.txt - Notepad"`.
    pub title: String,
    /// Executable stem, e.g. `"notepad"`. Empty when the process is unknown.
    pub app_name: String,
    /// Full executable path, used as the icon cache key. Empty when unknown.
    pub app_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppIcon {
    pub width: u32,
    pub height: u32,
    /// Raw RGBA8 pixels, base64-encoded, row-major, top-down.
    pub rgba: String,
}

/// Maps executable path to its icon. `None` records a lookup that failed, so a
/// path without an icon is not re-queried on every render.
static ICON_CACHE: Lazy<Mutex<HashMap<String, Option<AppIcon>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Title, executable name and executable path of the current foreground window.
#[tauri::command]
pub fn get_active_window_info() -> Result<ActiveWindowInfo, String> {
    imp::active_window_info()
}

/// Icon of the executable at `app_path` as raw RGBA, or `None` when it has none.
#[tauri::command]
pub fn get_app_icon(app_path: String) -> Result<Option<AppIcon>, String> {
    if app_path.trim().is_empty() {
        return Ok(None);
    }

    if let Ok(cache) = ICON_CACHE.lock() {
        if let Some(hit) = cache.get(&app_path) {
            return Ok(hit.clone());
        }
    }

    let icon = imp::extract_icon(&app_path);

    if let Ok(mut cache) = ICON_CACHE.lock() {
        if cache.len() >= MAX_CACHE_ENTRIES {
            // Cheap eviction: drop everything rather than track recency for a
            // cache this small.
            cache.clear();
        }
        cache.insert(app_path, icon.clone());
    }

    Ok(icon)
}

#[cfg(target_os = "windows")]
mod imp {
    use super::{ActiveWindowInfo, AppIcon};
    use base64::Engine as _;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{CloseHandle, HANDLE};
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDIBits, GetObjectW,
        SelectObject, BITMAP, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS, HGDIOBJ,
    };
    use windows::Win32::Storage::FileSystem::FILE_ATTRIBUTE_NORMAL;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
    use windows::Win32::UI::WindowsAndMessaging::{
        DestroyIcon, DrawIconEx, GetForegroundWindow, GetIconInfo, GetWindowTextW,
        GetWindowThreadProcessId, DI_NORMAL, HICON, ICONINFO,
    };

    pub fn active_window_info() -> Result<ActiveWindowInfo, String> {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.is_invalid() {
                return Err("No foreground window".to_string());
            }

            let mut title_buf = [0u16; 512];
            let title_len = GetWindowTextW(hwnd, &mut title_buf);
            let title = String::from_utf16_lossy(&title_buf[..title_len.max(0) as usize]);

            let mut info = ActiveWindowInfo {
                title,
                ..Default::default()
            };

            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid != 0 {
                if let Some(path) = process_image_path(pid) {
                    info.app_name = executable_stem(&path);
                    info.app_path = path;
                }
            }

            Ok(info)
        }
    }

    /// Full executable path of `pid`, or `None` when it cannot be opened —
    /// elevated processes refuse `PROCESS_QUERY_LIMITED_INFORMATION`.
    unsafe fn process_image_path(pid: u32) -> Option<String> {
        let handle: HANDLE = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let queried = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            windows::core::PWSTR(buf.as_mut_ptr()),
            &mut len,
        )
        .is_ok();
        let _ = CloseHandle(handle);

        if !queried || len == 0 {
            return None;
        }
        Some(String::from_utf16_lossy(&buf[..len as usize]))
    }

    fn executable_stem(path: &str) -> String {
        std::path::Path::new(path)
            .file_stem()
            .map(|stem| stem.to_string_lossy().to_string())
            .unwrap_or_default()
    }

    pub fn extract_icon(app_path: &str) -> Option<AppIcon> {
        unsafe {
            let wide: Vec<u16> = app_path
                .encode_utf16()
                .chain(std::iter::once(0))
                .collect();

            let mut shfi = SHFILEINFOW::default();
            let ok = SHGetFileInfoW(
                PCWSTR(wide.as_ptr()),
                FILE_ATTRIBUTE_NORMAL,
                Some(&mut shfi),
                std::mem::size_of::<SHFILEINFOW>() as u32,
                SHGFI_ICON | SHGFI_LARGEICON,
            );
            if ok == 0 || shfi.hIcon.is_invalid() {
                return None;
            }

            let rendered = render_icon(shfi.hIcon);
            let _ = DestroyIcon(shfi.hIcon);
            rendered
        }
    }

    /// Draws `hicon` into a 32bpp top-down DIB and reads the pixels back.
    unsafe fn render_icon(hicon: HICON) -> Option<AppIcon> {
        const FALLBACK_SIZE: i32 = 32;

        let mut icon_info = ICONINFO::default();
        GetIconInfo(hicon, &mut icon_info).ok()?;

        let mut bitmap = BITMAP::default();
        let mut width = FALLBACK_SIZE;
        let mut height = FALLBACK_SIZE;
        if !icon_info.hbmColor.is_invalid() {
            let written = GetObjectW(
                HGDIOBJ(icon_info.hbmColor.0),
                std::mem::size_of::<BITMAP>() as i32,
                Some(&mut bitmap as *mut _ as *mut _),
            );
            if written != 0 && bitmap.bmWidth > 0 && bitmap.bmHeight > 0 {
                width = bitmap.bmWidth;
                height = bitmap.bmHeight;
            }
        }

        let info = dib_info(width, height);

        let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
        let dib = match CreateDIBSection(None, &info, DIB_RGB_COLORS, &mut bits, None, 0) {
            Ok(dib) if !bits.is_null() => dib,
            _ => {
                free_icon_bitmaps(&icon_info);
                return None;
            }
        };

        let dc = CreateCompatibleDC(None);
        if dc.is_invalid() {
            let _ = DeleteObject(HGDIOBJ(dib.0));
            free_icon_bitmaps(&icon_info);
            return None;
        }

        // DrawIconEx paints into whichever bitmap is selected into the DC, so
        // the DIB has to be selected first — otherwise the icon lands on the
        // DC's default 1x1 surface and the DIB stays zeroed.
        let previous = SelectObject(dc, HGDIOBJ(dib.0));

        // The DIB starts zeroed, i.e. fully transparent, so DrawIconEx's own
        // alpha blending lands on a clean surface.
        let _ = DrawIconEx(dc, 0, 0, hicon, width, height, 0, None, DI_NORMAL);

        let mut rgba = vec![0u8; (width as usize) * (height as usize) * 4];
        let mut read_info = dib_info(width, height);
        let lines = GetDIBits(
            dc,
            dib,
            0,
            height as u32,
            Some(rgba.as_mut_ptr() as *mut core::ffi::c_void),
            &mut read_info,
            DIB_RGB_COLORS,
        );

        SelectObject(dc, previous);
        let _ = DeleteObject(HGDIOBJ(dib.0));
        let _ = DeleteDC(dc);
        free_icon_bitmaps(&icon_info);

        if lines == 0 {
            return None;
        }

        // GetDIBits hands back BGRA for a BI_RGB 32bpp section.
        for pixel in rgba.chunks_exact_mut(4) {
            pixel.swap(0, 2);
        }

        // An icon that drew nothing readable — typically a legacy resource with
        // no alpha channel — is better reported as absent: the card then falls
        // back to its coloured monogram instead of showing a black square.
        if !rgba.chunks_exact(4).any(|pixel| pixel[3] != 0 && pixel[0..3] != [0, 0, 0]) {
            return None;
        }

        Some(AppIcon {
            width: width as u32,
            height: height as u32,
            rgba: base64::engine::general_purpose::STANDARD.encode(&rgba),
        })
    }

    /// A 32bpp BI_RGB header. Negative height requests a top-down DIB, which
    /// matches the row order RGBA expects.
    fn dib_info(width: i32, height: i32) -> BITMAPINFO {
        BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: 0,
                ..Default::default()
            },
            ..Default::default()
        }
    }

    unsafe fn free_icon_bitmaps(icon_info: &ICONINFO) {
        if !icon_info.hbmColor.is_invalid() {
            let _ = DeleteObject(HGDIOBJ(icon_info.hbmColor.0));
        }
        if !icon_info.hbmMask.is_invalid() {
            let _ = DeleteObject(HGDIOBJ(icon_info.hbmMask.0));
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod imp {
    use super::{ActiveWindowInfo, AppIcon};

    pub fn active_window_info() -> Result<ActiveWindowInfo, String> {
        Err("Active window detection is only supported on Windows".to_string())
    }

    pub fn extract_icon(_app_path: &str) -> Option<AppIcon> {
        None
    }
}
