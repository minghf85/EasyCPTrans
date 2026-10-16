//! Native Windows drag source, so a card can be dragged out of the panel and
//! dropped into any other application.
//!
//! Tauri has no API for this (`start_dragging` moves the window, not content),
//! so the drag is driven directly through OLE: we supply an `IDataObject`
//! carrying the card's payload and an `IDropSource` for the feedback loop, then
//! hand both to `DoDragDrop`.
//!
//! Payload formats:
//! - text cards publish `CF_UNICODETEXT`
//! - file cards publish `CF_HDROP` with the original paths
//! - image cards publish `CF_HDROP` pointing at a temporary PNG
//! - both file and image cards also publish `"Preferred DropEffect"`, which is
//!   how Explorer and Chromium decide between copying and moving
//!
//! Every drop target in reach — Notepad, a browser address bar, an `<input
//! type=file>`, Excel, Explorer — accepts at least one of those.

use serde::Deserialize;

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DragOutPayload {
    /// Plain text carried by `CF_UNICODETEXT`.
    #[serde(default)]
    pub text: Option<String>,
    /// Absolute paths carried by `CF_HDROP`.
    #[serde(default)]
    pub files: Vec<String>,
    /// What the cursor drags along. Optional: without it the drag still works,
    /// the OS just shows its own generic feedback.
    #[serde(default)]
    pub preview: Option<DragPreview>,
}

/// The drag image, as raw pixels rather than an encoded image.
///
/// OLE wants an `HBITMAP`, and the project has no image decoder to turn a PNG
/// into one — so the front-end paints the chip on a canvas and hands over the
/// RGBA bytes, exactly the way it already does for application icons.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DragPreview {
    pub width: u32,
    pub height: u32,
    /// Base64 RGBA8, row-major, top-down.
    pub rgba: String,
}

/// Outcome of a drag: `"copy"`, `"move"`, `"cancelled"` or `"none"`.
#[tauri::command]
pub async fn start_drag_out(payload: DragOutPayload) -> Result<String, String> {
    if payload.text.is_none() && payload.files.is_empty() {
        return Err("Nothing to drag".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        // `DoDragDrop` blocks its thread until the drop resolves, and OLE wants a
        // single-threaded apartment that is never recycled — so it gets a
        // throwaway thread rather than a pooled async worker.
        tauri::async_runtime::spawn_blocking(move || {
            std::thread::spawn(move || imp::run_drag(payload))
                .join()
                .map_err(|_| "Drag thread panicked".to_string())?
        })
        .await
        .map_err(|err| err.to_string())?
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = payload;
        Err("Dragging out is only supported on Windows".to_string())
    }
}

/// Native file drag via the Shell API — the same path vPaste uses.
///
/// `ILCreateFromPathW` → `SHCreateShellItemArrayFromIDLists` →
/// `BindToHandler(BHID_DataObject)` → `SHDoDragDrop`.
///
/// The Shell builds the `IDataObject`, so drop targets see exactly the same
/// formats they would from Explorer. Synchronous: `SHDoDragDrop` enters its own
/// modal loop, so an async wrapper would only add latency.
#[tauri::command]
pub fn native_drag_file(paths: Vec<String>) -> Result<bool, String> {
    if paths.is_empty() {
        return Err("No files to drag".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        shell_drag::run_shell_drag(paths)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("File dragging is only supported on Windows".to_string())
    }
}

#[cfg(target_os = "windows")]
mod shell_drag {
    use windows::core::HSTRING;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Com::{IBindCtx, IDataObject};
    use windows::Win32::System::Ole::{
        IDropSource, OleInitialize, OleUninitialize, DROPEFFECT_COPY, DROPEFFECT_NONE,
    };
    use windows::Win32::UI::Shell::{
        BHID_DataObject, ILCreateFromPathW, ILFree, SHCreateShellItemArrayFromIDLists,
        SHDoDragDrop,
    };

    /// Strips the `\\?\` verbatim prefix that Windows APIs sometimes add.
    /// The Shell APIs reject paths with that prefix.
    fn shell_compatible_windows_path(path: &str) -> String {
        if let Some(path) = path.strip_prefix(r"\\?\UNC\") {
            format!(r"\\{path}")
        } else if let Some(path) = path.strip_prefix(r"\\?\") {
            path.to_string()
        } else {
            path.to_string()
        }
    }

    unsafe fn create_shell_file_item_array(
        paths: &[String],
    ) -> Result<windows::Win32::UI::Shell::IShellItemArray, String> {
        if paths.is_empty() {
            return Err("native drag requires at least one file".to_string());
        }

        let mut pidls = Vec::with_capacity(paths.len());
        for path in paths {
            let hstring = HSTRING::from(path.as_str());
            let pidl = ILCreateFromPathW(&hstring);
            if pidl.is_null() {
                for pidl in pidls {
                    ILFree(Some(pidl));
                }
                return Err("create Shell drag item failed".to_string());
            }
            pidls.push(pidl);
        }

        let pidl_refs: Vec<_> = pidls.iter().map(|pidl| *pidl as *const _).collect();
        let result = SHCreateShellItemArrayFromIDLists(&pidl_refs)
            .map_err(|err| format!("create Shell drag item array failed: {err}"));

        for pidl in pidls {
            ILFree(Some(pidl));
        }
        result
    }

    unsafe fn create_shell_file_data_object(
        paths: &[String],
    ) -> Result<IDataObject, String> {
        let items = create_shell_file_item_array(paths)?;
        items
            .BindToHandler(None::<&IBindCtx>, &BHID_DataObject)
            .map_err(|err| format!("create Shell file data object failed: {err}"))
    }

    pub fn run_shell_drag(paths: Vec<String>) -> Result<bool, String> {
        let paths: Vec<String> = paths
            .into_iter()
            .map(|path| {
                let path = std::path::PathBuf::from(path)
                    .canonicalize()
                    .map_err(|err| format!("resolve drag file path failed: {err}"))?;
                let path = path
                    .to_str()
                    .ok_or_else(|| "drag file path is not valid unicode".to_string())?;
                Ok(shell_compatible_windows_path(path))
            })
            .collect::<Result<Vec<_>, String>>()?;

        unsafe {
            OleInitialize(None).map_err(|err| format!("initialize Windows OLE failed: {err}"))?;
            let result = (|| {
                let data_object = create_shell_file_data_object(&paths)?;
                let effect = SHDoDragDrop(
                    Some(HWND(std::ptr::null_mut())),
                    &data_object,
                    None::<&IDropSource>,
                    DROPEFFECT_COPY,
                )
                .map_err(|err| format!("native drag failed: {err}"))?;
                Ok(effect != DROPEFFECT_NONE)
            })();
            OleUninitialize();
            result
        }
    }
}

#[cfg(target_os = "windows")]
mod imp {
    use super::{DragOutPayload, DragPreview};
    use base64::Engine as _;
    use once_cell::sync::Lazy;
    use windows::core::{implement, BOOL, HRESULT};
    use windows::Win32::Foundation::{
        GlobalFree, COLORREF, DRAGDROP_S_CANCEL, DRAGDROP_S_DROP, DRAGDROP_S_USEDEFAULTCURSORS,
        DV_E_DVASPECT, DV_E_FORMATETC, DV_E_LINDEX, DV_E_TYMED, E_INVALIDARG, E_NOTIMPL, HGLOBAL,
        POINT, SIZE,
    };
    use windows::Win32::Graphics::Gdi::{
        CreateDIBSection, DeleteObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
        HBITMAP, HGDIOBJ,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, IDataObject, IDataObject_Impl, IEnumFORMATETC, STGMEDIUM, STGMEDIUM_0,
        CLSCTX_INPROC_SERVER, DATADIR_GET, DVASPECT_CONTENT, FORMATETC, TYMED_HGLOBAL,
    };
    use windows::Win32::System::DataExchange::RegisterClipboardFormatW;
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    use windows::Win32::System::Ole::{
        DoDragDrop, IDropSource, IDropSource_Impl, OleInitialize, OleUninitialize, CF_HDROP,
        CF_UNICODETEXT, DROPEFFECT, DROPEFFECT_COPY, DROPEFFECT_NONE,
    };
    use windows::Win32::System::SystemServices::{MK_LBUTTON, MODIFIERKEYS_FLAGS};
    use windows::Win32::UI::Shell::{
        IDragSourceHelper, SHDRAGIMAGE, CLSID_DragDropHelper, DROPFILES, SHCreateStdEnumFmtEtc,
        CFSTR_PREFERREDDROPEFFECT,
    };

    /// `CLR_NONE` tells the drag helper to use the bitmap's alpha channel
    /// instead of a colour key. It lives in a module this crate does not enable,
    /// so the value is spelled out.
    const CLR_NONE: u32 = 0xFFFF_FFFF;

    /// Where the cursor sits inside the drag image, in its own pixels: roughly
    /// where the pointer would be on a card the same size, so the chip does not
    /// sit centred over the target the user is aiming at.
    const GRAB_OFFSET_X: i32 = 26;
    const GRAB_OFFSET_Y: i32 = 26;

    /// `IDataObject::GetCanonicalFormatEtc` returns this to mean "the requested
    /// format, unchanged". The windows crate ships no constant for it.
    const DATA_S_SAMEFORMATETC: HRESULT = HRESULT(0x0004_0130);

    /// Clipboard format id of `"Preferred DropEffect"`, which has no predefined
    /// number and so has to be registered by name. Registering the same name
    /// twice returns the same id, which is why caching it is safe.
    fn preferred_drop_effect_format() -> u16 {
        static ID: Lazy<u16> =
            Lazy::new(|| unsafe { RegisterClipboardFormatW(CFSTR_PREFERREDDROPEFFECT) as u16 });
        *ID
    }

    /// Runs a drag on a dedicated STA thread; `DoDragDrop` blocks until the drop
    /// completes, so this must not occupy an async worker.
    pub fn run_drag(payload: DragOutPayload) -> Result<String, String> {
        unsafe {
            OleInitialize(None).map_err(|err| format!("OleInitialize failed: {err}"))?;
            let outcome = do_drag(payload);
            OleUninitialize();
            outcome
        }
    }

    fn do_drag(payload: DragOutPayload) -> Result<String, String> {
        let data = DragData::new(&payload)?;
        let data_object: IDataObject = data.into();
        let drop_source: IDropSource = DragSource.into();

        // The drag image is a nicety: if it cannot be built the drag still has to
        // happen, so a failure is only logged.
        if let Some(preview) = payload.preview.as_ref() {
            if let Err(err) = apply_drag_image(&data_object, preview) {
                println!("[EasyCPTrans] Drag-out image unavailable: {err}");
            }
        }

        let mut effect = DROPEFFECT_NONE;
        // Only COPY is offered. A clipboard manager must never take the user's
        // original file away, and the `"Preferred DropEffect"` format published
        // by `DragData::new` tells targets the same thing before they ask for
        // the data.
        let hr = unsafe { DoDragDrop(&data_object, &drop_source, DROPEFFECT_COPY, &mut effect) };

        // Only COPY is offered, so a non-zero effect other than COPY means no
        // drop happened; the raw effect is logged below either way.
        let outcome = if effect == DROPEFFECT_COPY {
            "copy"
        } else if hr == DRAGDROP_S_CANCEL || hr.is_err() {
            "cancelled"
        } else {
            "none"
        };

        // The drag loop runs on its own thread, so this is the only place the
        // result is visible when a drop mysteriously does nothing.
        let kind = if payload.text.is_some() { "text" } else { "files" };
        println!(
            "[EasyCPTrans] Drag-out finished: kind={kind} effect={} outcome={outcome} hr={hr:?}",
            effect.0
        );

        Ok(outcome.to_string())
    }

    /// Owns the payload bytes. An `HGLOBAL` is allocated per `GetData` call
    /// because the drop target takes ownership of the returned medium and frees
    /// it — handing out a shared handle would double-free.
    #[implement(IDataObject)]
    struct DragData {
        text: Option<Vec<u8>>,
        files: Option<Vec<u8>>,
        preferred_effect: Option<Vec<u8>>,
        formats: Vec<FORMATETC>,
    }

    impl DragData {
        fn new(payload: &DragOutPayload) -> Result<Self, String> {
            let text = payload
                .text
                .as_ref()
                .filter(|value| !value.is_empty())
                .map(|value| {
                    let mut wide: Vec<u16> = value.encode_utf16().collect();
                    wide.push(0);
                    wide_to_bytes(&wide)
                });

            let files = if payload.files.is_empty() {
                None
            } else {
                Some(build_hdrop(&payload.files))
            };

            // A single little-endian DWORD. Explorer and Chromium read it to
            // decide between copying and moving; without it the default can be
            // "move", and a clipboard manager must never take the user's
            // original file away.
            let preferred_effect = files
                .as_ref()
                .map(|_| DROPEFFECT_COPY.0.to_le_bytes().to_vec());

            let mut formats = Vec::new();
            if text.is_some() {
                formats.push(format_etc(CF_UNICODETEXT.0));
            }
            if files.is_some() {
                formats.push(format_etc(CF_HDROP.0));
                formats.push(format_etc(preferred_drop_effect_format()));
            }
            if formats.is_empty() {
                return Err("Nothing to drag".to_string());
            }

            Ok(Self {
                text,
                files,
                preferred_effect,
                formats,
            })
        }

        fn bytes_for(&self, cf_format: u16) -> Option<&[u8]> {
            if cf_format == CF_UNICODETEXT.0 {
                return self.text.as_deref();
            }
            if cf_format == CF_HDROP.0 {
                return self.files.as_deref();
            }
            if cf_format == preferred_drop_effect_format() {
                return self.preferred_effect.as_deref();
            }
            None
        }

        /// A `FORMATETC` names a format in four parts, not just the format id:
        /// the drop target is free to ask for a stream, a thumbnail or a
        /// different index, and answering those with data would be a lie.
        fn accepts(&self, format: &FORMATETC) -> bool {
            format.dwAspect == DVASPECT_CONTENT.0
                && format.lindex == -1
                && (format.tymed & (TYMED_HGLOBAL.0 as u32)) != 0
                && self.bytes_for(format.cfFormat).is_some()
        }
    }

    impl IDataObject_Impl for DragData_Impl {
        fn GetData(&self, pformatetcin: *const FORMATETC) -> windows::core::Result<STGMEDIUM> {
            let Some(format) = (unsafe { pformatetcin.as_ref() }) else {
                return Err(E_INVALIDARG.into());
            };

            if format.dwAspect != DVASPECT_CONTENT.0 {
                return Err(DV_E_DVASPECT.into());
            }
            if format.lindex != -1 {
                return Err(DV_E_LINDEX.into());
            }
            if (format.tymed & (TYMED_HGLOBAL.0 as u32)) == 0 {
                return Err(DV_E_TYMED.into());
            }

            match self.bytes_for(format.cfFormat) {
                Some(bytes) => hglobal_medium(bytes),
                None => Err(DV_E_FORMATETC.into()),
            }
        }

        fn QueryGetData(&self, pformatetc: *const FORMATETC) -> HRESULT {
            let Some(format) = (unsafe { pformatetc.as_ref() }) else {
                return E_INVALIDARG;
            };

            // Reported in the same order as `GetData`, because a target
            // typically probes with `TYMED_HGLOBAL | TYMED_ISTREAM` and needs to
            // be told that only the first part of that is on offer.
            if format.dwAspect != DVASPECT_CONTENT.0 {
                return DV_E_DVASPECT;
            }
            if format.lindex != -1 {
                return DV_E_LINDEX;
            }
            if (format.tymed & (TYMED_HGLOBAL.0 as u32)) == 0 {
                return DV_E_TYMED;
            }
            if self.accepts(format) {
                HRESULT(0)
            } else {
                DV_E_FORMATETC
            }
        }

        fn EnumFormatEtc(&self, dwdirection: u32) -> windows::core::Result<IEnumFORMATETC> {
            if dwdirection != DATADIR_GET.0 as u32 {
                // The direction is a valid argument that simply is not
                // supported, which is `E_NOTIMPL` — `DV_E_FORMATETC` means "that
                // format is malformed" and makes some hosts give up entirely.
                return Err(E_NOTIMPL.into());
            }
            unsafe { SHCreateStdEnumFmtEtc(&self.formats) }
        }

        fn GetDataHere(
            &self,
            _pformatetc: *const FORMATETC,
            _pmedium: *mut STGMEDIUM,
        ) -> windows::core::Result<()> {
            Err(E_NOTIMPL.into())
        }

        /// Answers "what would you give me for this format, canonically?".
        ///
        /// Returning `DV_E_FORMATETC` for a format the object *does* offer is
        /// what the old implementation did, and it is the classic way to have a
        /// drop target decide there is nothing here: Chromium's OLE provider
        /// canonicalises before it asks for data.
        fn GetCanonicalFormatEtc(
            &self,
            pformatectin: *const FORMATETC,
            pformatetcout: *mut FORMATETC,
        ) -> HRESULT {
            if pformatectin.is_null() || pformatetcout.is_null() {
                return E_INVALIDARG;
            }
            let format = unsafe { *pformatectin };

            if (format.tymed & (TYMED_HGLOBAL.0 as u32)) == 0 {
                // Nothing to canonicalise for a medium we do not serve; the
                // contract says to say so with `E_NOTIMPL` so the caller falls
                // back to its original request.
                return E_NOTIMPL;
            }
            if self.bytes_for(format.cfFormat).is_none() {
                return DV_E_FORMATETC;
            }

            let mut canonical = format;
            canonical.ptd = std::ptr::null_mut();
            unsafe { *pformatetcout = canonical };
            DATA_S_SAMEFORMATETC
        }

        fn SetData(
            &self,
            _pformatetc: *const FORMATETC,
            _pmedium: *const STGMEDIUM,
            _frelease: BOOL,
        ) -> windows::core::Result<()> {
            Err(E_NOTIMPL.into())
        }

        fn DAdvise(
            &self,
            _pformatetc: *const FORMATETC,
            _advf: u32,
            _padvsink: windows::core::Ref<'_, windows::Win32::System::Com::IAdviseSink>,
        ) -> windows::core::Result<u32> {
            Err(E_NOTIMPL.into())
        }

        fn DUnadvise(&self, _dwconnection: u32) -> windows::core::Result<()> {
            Err(E_NOTIMPL.into())
        }

        fn EnumDAdvise(&self) -> windows::core::Result<windows::Win32::System::Com::IEnumSTATDATA> {
            Err(E_NOTIMPL.into())
        }
    }

    /// Hands the drag image to OLE.
    ///
    /// The helper wraps our data object in one of its own that also carries the
    /// bitmap, so the image travels with the drag without us publishing an extra
    /// clipboard format anyone could ask for.
    fn apply_drag_image(data_object: &IDataObject, preview: &DragPreview) -> Result<(), String> {
        let width = preview.width;
        let height = preview.height;
        if width == 0 || height == 0 {
            return Err("the preview has no size".to_string());
        }

        let expected = (width as usize) * (height as usize) * 4;
        let rgba = base64::engine::general_purpose::STANDARD
            .decode(&preview.rgba)
            .map_err(|err| format!("preview is not base64: {err}"))?;
        if rgba.len() < expected {
            return Err(format!(
                "preview is {} bytes but {}x{} needs {expected}",
                rgba.len(),
                width,
                height
            ));
        }

        let bitmap = create_dib_section(width, height, &premultiplied_bgra(&rgba[..expected]))?;

        let image = SHDRAGIMAGE {
            sizeDragImage: SIZE {
                cx: width as i32,
                cy: height as i32,
            },
            ptOffset: POINT {
                x: GRAB_OFFSET_X,
                y: GRAB_OFFSET_Y,
            },
            hbmpDragImage: bitmap,
            crColorKey: COLORREF(CLR_NONE),
        };

        let helper: IDragSourceHelper =
            unsafe { CoCreateInstance(&CLSID_DragDropHelper, None, CLSCTX_INPROC_SERVER) }
                .map_err(|err| format!("drag helper unavailable: {err}"))?;

        match unsafe { helper.InitializeFromBitmap(&image, data_object) } {
            Ok(()) => Ok(()),
            Err(err) => {
                // On success the helper's data object owns the bitmap and frees
                // it; on failure nobody does.
                unsafe {
                    let _ = DeleteObject(HGDIOBJ(bitmap.0));
                }
                Err(format!("InitializeFromBitmap failed: {err}"))
            }
        }
    }

    /// OLE composites the drag image with `AlphaBlend`, which expects
    /// premultiplied BGRA — handing over straight ARGB leaves a bright fringe
    /// around the chip's rounded corners and its drop shadow.
    fn premultiplied_bgra(rgba: &[u8]) -> Vec<u8> {
        let mut out = Vec::with_capacity(rgba.len());
        for pixel in rgba.chunks_exact(4) {
            let alpha = pixel[3] as u32;
            out.push(((pixel[2] as u32 * alpha) / 255) as u8);
            out.push(((pixel[1] as u32 * alpha) / 255) as u8);
            out.push(((pixel[0] as u32 * alpha) / 255) as u8);
            out.push(pixel[3]);
        }
        out
    }

    /// A top-down 32-bit DIB section, which is the only bitmap shape the drag
    /// helper accepts an alpha channel on.
    fn create_dib_section(width: u32, height: u32, bgra: &[u8]) -> Result<HBITMAP, String> {
        let info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width as i32,
                // Negative height: rows run top-down, matching the pixel order the
                // canvas produced.
                biHeight: -(height as i32),
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
        let bitmap = unsafe { CreateDIBSection(None, &info, DIB_RGB_COLORS, &mut bits, None, 0) }
            .map_err(|err| format!("CreateDIBSection failed: {err}"))?;

        if bits.is_null() {
            unsafe {
                let _ = DeleteObject(HGDIOBJ(bitmap.0));
            }
            return Err("CreateDIBSection returned no pixels".to_string());
        }

        let count = bgra.len().min((width as usize) * (height as usize) * 4);
        unsafe {
            std::ptr::copy_nonoverlapping(bgra.as_ptr(), bits as *mut u8, count);
        }

        Ok(bitmap)
    }

    /// Drives the drag loop. Returning `S_OK` keeps the drag alive; the drag ends
    /// when Escape is pressed or the left mouse button comes back up.
    #[implement(IDropSource)]
    struct DragSource;

    impl IDropSource_Impl for DragSource_Impl {
        fn QueryContinueDrag(
            &self,
            fescapepressed: BOOL,
            grfkeystate: MODIFIERKEYS_FLAGS,
        ) -> HRESULT {
            if fescapepressed.as_bool() {
                DRAGDROP_S_CANCEL
            } else if (grfkeystate.0 & MK_LBUTTON.0) == 0 {
                DRAGDROP_S_DROP
            } else {
                HRESULT(0)
            }
        }

        fn GiveFeedback(&self, _dweffect: DROPEFFECT) -> HRESULT {
            DRAGDROP_S_USEDEFAULTCURSORS
        }
    }

    fn format_etc(cf_format: u16) -> FORMATETC {
        FORMATETC {
            cfFormat: cf_format,
            ptd: std::ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0,
            lindex: -1,
            tymed: TYMED_HGLOBAL.0 as u32,
        }
    }

    fn wide_to_bytes(wide: &[u16]) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(wide.len() * 2);
        for unit in wide {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        bytes
    }

    /// `DROPFILES` header followed by a double-null-terminated list of wide paths.
    fn build_hdrop(paths: &[String]) -> Vec<u8> {
        let mut wide: Vec<u16> = Vec::new();
        for path in paths {
            wide.extend(path.encode_utf16());
            wide.push(0);
        }
        wide.push(0);

        let header = DROPFILES {
            pFiles: std::mem::size_of::<DROPFILES>() as u32,
            pt: POINT { x: 0, y: 0 },
            fNC: BOOL(0),
            fWide: BOOL(1),
        };

        let mut bytes = unsafe {
            std::slice::from_raw_parts(
                &header as *const DROPFILES as *const u8,
                std::mem::size_of::<DROPFILES>(),
            )
        }
        .to_vec();
        bytes.extend_from_slice(&wide_to_bytes(&wide));
        bytes
    }

    fn hglobal_medium(bytes: &[u8]) -> windows::core::Result<STGMEDIUM> {
        unsafe {
            let handle: HGLOBAL = GlobalAlloc(GMEM_MOVEABLE, bytes.len())?;
            let target = GlobalLock(handle);
            if target.is_null() {
                let _ = GlobalFree(Some(handle));
                return Err(windows::core::Error::from_win32());
            }
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), target as *mut u8, bytes.len());
            let _ = GlobalUnlock(handle);

            Ok(STGMEDIUM {
                tymed: TYMED_HGLOBAL.0 as u32,
                u: STGMEDIUM_0 { hGlobal: handle },
                pUnkForRelease: std::mem::ManuallyDrop::new(None),
            })
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        fn file_payload(paths: &[&str]) -> DragOutPayload {
            DragOutPayload {
                files: paths.iter().map(|path| path.to_string()).collect(),
                ..Default::default()
            }
        }

        #[test]
        fn hdrop_uses_the_layout_ole_expects() {
            let bytes = build_hdrop(&["C:\\a.txt".to_string()]);

            // The header size is what `pFiles` has to point to.
            assert_eq!(std::mem::size_of::<DROPFILES>(), 20);
            let p_files = u32::from_le_bytes(bytes[0..4].try_into().unwrap());
            assert_eq!(p_files as usize, std::mem::size_of::<DROPFILES>());

            // fNC stays 0 and fWide says the paths are UTF-16.
            assert_eq!(i32::from_le_bytes(bytes[12..16].try_into().unwrap()), 0);
            assert_eq!(i32::from_le_bytes(bytes[16..20].try_into().unwrap()), 1);

            // Path, a terminator, and the list terminator: two NULs at the end.
            let payload = &bytes[20..];
            assert_eq!(payload.len(), ("C:\\a.txt".len() + 1 + 1) * 2);
            assert_eq!(&payload[payload.len() - 4..], &[0, 0, 0, 0]);
        }

        #[test]
        fn hdrop_lists_every_path_in_order() {
            let bytes = build_hdrop(&["C:\\a.txt".to_string(), "D:\\b.pdf".to_string()]);
            let payload = &bytes[20..];
            let units: Vec<u16> = payload
                .chunks_exact(2)
                .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
                .collect();
            let text = String::from_utf16_lossy(&units);

            assert!(text.starts_with("C:\\a.txt\0D:\\b.pdf\0"));
            assert_eq!(&units[units.len() - 2..], &[0, 0]);
        }

        #[test]
        fn text_payloads_offer_unicode_text() {
            let data = DragData::new(&DragOutPayload {
                text: Some("hello".to_string()),
                ..Default::default()
            })
            .unwrap();

            assert_eq!(data.formats.len(), 1);
            assert_eq!(data.formats[0].cfFormat, CF_UNICODETEXT.0);
            assert!(data.files.is_none());
            // UTF-16LE, NUL terminated.
            assert_eq!(data.text.unwrap().len(), ("hello".len() + 1) * 2);
        }

        #[test]
        fn an_empty_text_payload_is_not_offered_at_all() {
            let data = DragData::new(&DragOutPayload {
                text: Some(String::new()),
                ..Default::default()
            });

            assert!(data.is_err(), "nothing to drag should be rejected");
        }

        #[test]
        fn file_payloads_also_publish_the_preferred_drop_effect() {
            let data = DragData::new(&file_payload(&["C:\\a.txt"])).unwrap();

            let formats: Vec<u16> = data.formats.iter().map(|format| format.cfFormat).collect();
            assert!(formats.contains(&CF_HDROP.0));
            assert!(formats.contains(&preferred_drop_effect_format()));
            assert!(!formats.contains(&CF_UNICODETEXT.0));

            // A single little-endian DWORD saying COPY.
            assert_eq!(DROPEFFECT_COPY.0, 1);
            assert_eq!(data.preferred_effect.as_deref(), Some(&[1, 0, 0, 0][..]));
        }

        #[test]
        fn a_text_only_payload_says_nothing_about_the_drop_effect() {
            let data = DragData::new(&DragOutPayload {
                text: Some("hello".to_string()),
                ..Default::default()
            })
            .unwrap();

            assert!(data.preferred_effect.is_none());
        }

        #[test]
        fn formats_are_advertised_as_content_in_an_hglobal() {
            let data = DragData::new(&file_payload(&["C:\\a.txt"])).unwrap();

            for format in &data.formats {
                assert_eq!(format.dwAspect, DVASPECT_CONTENT.0);
                assert_eq!(format.lindex, -1);
                assert_eq!(format.tymed, TYMED_HGLOBAL.0 as u32);
                assert!(format.ptd.is_null(), "a canonical format names no target device");
            }
        }

        #[test]
        fn a_format_is_only_accepted_in_the_shape_it_is_offered_in() {
            let data = DragData::new(&file_payload(&["C:\\a.txt"])).unwrap();
            let good = format_etc(CF_HDROP.0);
            assert!(data.accepts(&good));

            let mut wrong_medium = good;
            wrong_medium.tymed = TYMED_HGLOBAL.0 as u32 + 1;
            assert!(!data.accepts(&wrong_medium));

            let mut wrong_aspect = good;
            wrong_aspect.dwAspect = DVASPECT_CONTENT.0 + 1;
            assert!(!data.accepts(&wrong_aspect));

            let mut wrong_index = good;
            wrong_index.lindex = 0;
            assert!(!data.accepts(&wrong_index));

            // And a format this payload simply does not carry.
            assert!(!data.accepts(&format_etc(CF_UNICODETEXT.0)));
        }

        #[test]
        fn every_advertised_format_resolves_to_bytes() {
            let data = DragData::new(&file_payload(&["C:\\a.txt"])).unwrap();

            for format in &data.formats {
                assert!(
                    data.bytes_for(format.cfFormat).is_some(),
                    "format {} is advertised but has no payload",
                    format.cfFormat
                );
            }
        }

        #[test]
        fn drag_images_are_premultiplied_bgra() {
            // Opaque: the byte order flips and the alpha stays put.
            assert_eq!(premultiplied_bgra(&[0, 0, 255, 255]), vec![255, 0, 0, 255]);
            // Fully transparent: every colour channel collapses to zero, which is
            // what keeps a rounded corner from showing a pale fringe.
            assert_eq!(premultiplied_bgra(&[255, 255, 255, 0]), vec![0, 0, 0, 0]);
            // Half alpha: each channel is scaled by 128/255.
            assert_eq!(premultiplied_bgra(&[200, 100, 50, 128]), vec![25, 50, 100, 128]);
        }

        #[test]
        fn premultiplication_ignores_a_trailing_partial_pixel() {
            assert!(premultiplied_bgra(&[1, 2, 3]).is_empty());
        }
    }
}

#[cfg(test)]
mod payload_tests {
    use super::DragOutPayload;

    #[test]
    fn a_payload_can_carry_a_drag_image() {
        // Guards the wire shape the front-end sends: camelCase keys, RGBA bytes
        // as base64.
        let payload: DragOutPayload = serde_json::from_str(
            r#"{"text":"hello","preview":{"width":2,"height":1,"rgba":"AAAA"}}"#,
        )
        .unwrap();

        assert_eq!(payload.text.as_deref(), Some("hello"));
        let preview = payload.preview.unwrap();
        assert_eq!(preview.width, 2);
        assert_eq!(preview.height, 1);
        assert_eq!(preview.rgba, "AAAA");
    }

    #[test]
    fn the_drag_image_is_optional() {
        let payload: DragOutPayload = serde_json::from_str(r#"{"text":"hello"}"#).unwrap();

        assert!(payload.preview.is_none());
        assert!(payload.files.is_empty());
    }
}
