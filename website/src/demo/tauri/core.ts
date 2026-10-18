import { DEMO_CONFIG, DEMO_ITEMS, SAMPLE_IMAGES } from "../data";
import { APP_ICON_URLS } from "../icons";
import { DEMO_OCR_TEXT_EVENT, DEMO_TRANSLATED_EVENT, demoBus } from "../bus";

/**
 * Browser stand-in for the Rust commands.
 *
 * The marketing site renders the real application components, so every command
 * they reach for resolves here instead of in Tauri. Anything the page does not
 * need returns a harmless value; image content and the regex preview are the
 * two places where sample data has to be real enough to drive the UI.
 */

type Args = Record<string, unknown> | undefined;

let nextId = 900;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * The desktop command returns raw RGBA because Rust has no image encoder. The
 * demo has the opposite problem — it has SVG icons but the card wants RGBA — so
 * this draws the brand mark into a canvas once per executable and hands back
 * the same shape the Rust side produces.
 */
const iconCache = new Map<string, Promise<{ width: number; height: number; rgba: string } | null>>();

function renderIconDataUrl(src: string) {
  return new Promise<{ width: number; height: number; rgba: string } | null>((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const size = 64;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(null);
          return;
        }
        context.clearRect(0, 0, size, size);
        context.drawImage(image, 0, 0, size, size);
        const pixels = context.getImageData(0, 0, size, size).data;
        let binary = "";
        for (let offset = 0; offset < pixels.length; offset += 0x8000) {
          binary += String.fromCharCode(...pixels.subarray(offset, offset + 0x8000));
        }
        resolve({ width: size, height: size, rgba: btoa(binary) });
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function appIcon(appPath: string) {
  const executable = appPath.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  const src = APP_ICON_URLS[executable];
  if (!src) return Promise.resolve(null);
  const cached = iconCache.get(executable);
  if (cached) return cached;
  const task = renderIconDataUrl(src);
  iconCache.set(executable, task);
  return task;
}

/** Contents a regex can scan, mirroring text + file paths + OCR text. */
function scanText(): string {
  return DEMO_ITEMS.map((item) => {
    if (item.contentType === "file") return item.content;
    if (item.contentType === "image") return item.metadata?.ocrText?.[0] ?? "";
    return item.content;
  }).join("\n");
}

function matchAll(pattern: string, ignoreCase: boolean, source: string) {
  const flags = ignoreCase ? "gi" : "g";
  const re = new RegExp(pattern, flags);
  const matches: string[] = [];
  const seen = new Set<string>();
  const segments: Array<{ text: string; matched: boolean }> = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    if (match[0] === "") {
      re.lastIndex += 1;
      continue;
    }
    if (lastIndex < match.index) {
      segments.push({ text: source.slice(lastIndex, match.index), matched: false });
    }
    segments.push({ text: match[0], matched: true });
    lastIndex = match.index + match[0].length;

    if (!seen.has(match[0])) {
      seen.add(match[0]);
      if (matches.length < 100) matches.push(match[0]);
    }
  }
  if (lastIndex < source.length) {
    segments.push({ text: source.slice(lastIndex), matched: false });
  }

  return { matches, segments, total: seen.size };
}

function assertSupportedPattern(pattern: string) {
  // Keep the demo honest about the Rust engine: it has neither lookaround nor
  // backreferences, and accepting those here would teach the wrong thing.
  if (/\(\?<?[=!]/.test(pattern) || /\\[1-9]/.test(pattern)) {
    throw new Error("Rust regex does not support lookaround or backreferences.");
  }
  new RegExp(pattern);
}

export async function invoke<T>(cmd: string, args?: Args): Promise<T> {
  const value = (() => {
    switch (cmd) {
      case "get_config":
        return DEMO_CONFIG;
      case "set_config":
      case "set_tags":
      case "toggle_pin":
      case "delete_item":
      case "update_text_item":
      case "protect_item":
      case "unprotect_item":
      case "mark_item_used":
      case "sync_queue_state":
      case "set_privacy_password":
      case "trigger_sync":
      case "set_lan_sync_enabled":
      case "refresh_global_shortcuts":
        return cmd === "refresh_global_shortcuts"
          ? { registered: [], failed: [] }
          : undefined;

      case "set_ocr_text": {
        const id = Number(args?.id);
        const text = typeof args?.text === "string" ? args.text : "";
        demoBus.dispatchEvent(
          new CustomEvent(DEMO_OCR_TEXT_EVENT, { detail: { id, text } }),
        );
        return undefined;
      }

      case "get_privacy_status":
        return {
          passwordSet: true,
          privateItems: DEMO_ITEMS.filter((item) => item.isPrivate).length,
          securityQuestionSet: true,
          securityQuestion: "What is the demo password?",
        };

      // The promo panel renders the real MemoryChip; give it a plausible value
      // instead of leaving the chip out of the replica.
      case "get_process_stats":
        return {
          workingSetBytes: 12_900_000,
          privateBytes: 8_400_000,
          peakWorkingSetBytes: 28_000_000,
        };

      case "list_ocr_languages":
        return [
          { tag: "zh-Hans-CN", name: "中文（简体）" },
          { tag: "en-US", name: "English (United States)" },
          { tag: "ja-JP", name: "日本語" },
        ];

      case "lan_sync_status":
        return { listening: false, peers: [] };
      case "trigger_lan_sync":
        return { peersFound: 0, pushed: 0, pulled: 0, errors: [] };
      case "generate_lan_pairing_code":
        return "DEMO42";
      case "verify_webdav":
        return true;
      case "probe_shortcut_available":
        return true;

      case "get_image_content":
        return SAMPLE_IMAGES[Number(args?.id)] ?? "";
      case "get_app_icon":
        return appIcon(text(args?.appPath));
      case "stage_image_for_drag":
      case "save_temp_image":
      case "read_image_as_data_url":
        return "";

      case "ocr_image_item":
        return "error TS2307: Cannot find module '@tauri-apps/api/core'\n  at ingestClipboard (commands.rs:1217)";
      case "create_text_item_from_ocr":
      case "create_stack_text_item":
        return nextId++;

      case "translate_text_api": {
        const source = text(args?.text);
        const target = text(args?.targetLang) || "中文";
        window.setTimeout(() => {
          demoBus.dispatchEvent(
            new CustomEvent(DEMO_TRANSLATED_EVENT, {
              detail: { text: source, targetLang: target },
            }),
          );
        }, 350);
        return undefined;
      }

      case "load_history":
        return DEMO_ITEMS;

      case "get_active_window_info":
        return { title: "", appName: "", appPath: "" };
      case "get_active_window":
        return "";

      case "preview_tag_pattern": {
        const pattern = text(args?.pattern);
        const ignoreCase = Boolean(args?.ignoreCase);
        assertSupportedPattern(pattern);
        const sample = typeof args?.sample === "string" ? args.sample : "";
        const source = sample || scanText();
        const result = matchAll(pattern, ignoreCase, source);
        return {
          ...result,
          truncated: result.total > result.matches.length,
          scanned: sample ? 1 : DEMO_ITEMS.length,
          skipped: 0,
        };
      }

      case "validate_tag_pattern": {
        assertSupportedPattern(text(args?.pattern));
        return null;
      }

      default:
        return null;
    }
  })();

  return value as T;
}
