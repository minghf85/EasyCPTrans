/**
 * What actually arrived on the clipboard.
 *
 * The order of these checks is the whole point of this module. When a picture is
 * copied, Windows hands over the bitmap *and* the path it was staged to at the
 * same time — and because the file list used to be checked first, every copied
 * screenshot was filed as a `file` item showing a path, never as an image.
 *
 * So: an image is an image even when it also has a path, and a single image file
 * with no bitmap behind it is still an image.
 */

/** The formats `read_image_as_data_url` can label correctly. */
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "bmp", "webp"] as const;
const IMAGE_EXTENSION_SET = new Set<string>(IMAGE_EXTENSIONS);

export interface ClipboardImageData {
  /** Path the clipboard plugin staged the bitmap to. */
  value: string;
  width: number;
  height: number;
}

export interface ClipboardSnapshot {
  image?: ClipboardImageData;
  files?: string[];
  text?: string;
}

export type ClipboardKind = "image" | "files" | "text" | "none";

export interface ClipboardClassification {
  kind: ClipboardKind;
  /**
   * For an image payload: where the pixels come from. The clipboard bitmap when
   * there is one, otherwise the single file that has to be read.
   */
  image: { fromClipboard: ClipboardImageData } | { fromPath: string } | null;
  paths: string[];
  text: string;
  /**
   * Identity of this payload, compared against the previous one to avoid
   * ingesting the same copy twice. The shapes are load-bearing: the rest of the
   * app suppresses re-ingestion of its own clipboard writes by matching these
   * strings (see `setInjectedOverrideSig`).
   */
  sig: string;
}

/** True for a path whose extension is an image this app can render. */
export function looksLikeImagePath(path: string): boolean {
  const name = path.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  // `dot <= 0` covers both "no extension" and a dotfile like `.gitignore`.
  if (dot <= 0 || dot === name.length - 1) return false;
  return IMAGE_EXTENSION_SET.has(name.slice(dot + 1).toLowerCase());
}

export function classifyClipboard(snapshot: ClipboardSnapshot): ClipboardClassification {
  const empty: ClipboardClassification = {
    kind: "none",
    image: null,
    paths: [],
    text: "",
    sig: "",
  };

  // 1. A bitmap beats everything: it is the only signal that says "this is a
  //    picture" rather than "this is a path that happens to end in .png".
  const bitmap = snapshot.image;
  if (bitmap?.value) {
    return {
      ...empty,
      kind: "image",
      image: { fromClipboard: bitmap },
      sig: `img_${bitmap.width}x${bitmap.height}_${bitmap.value}`,
    };
  }

  const paths = snapshot.files ?? [];

  // 2. A lone image file with no bitmap is still a picture — that is what the
  //    user copied, and a path preview would be a worse card than the image.
  if (paths.length === 1 && looksLikeImagePath(paths[0])) {
    return {
      ...empty,
      kind: "image",
      image: { fromPath: paths[0] },
      paths,
      sig: `imgfile_${paths[0]}`,
    };
  }

  // 3. Several files stay several files. Filtering the images out of a bundle
  //    would silently drop part of what the user copied.
  if (paths.length > 0) {
    return {
      ...empty,
      kind: "files",
      paths,
      sig: `files_${paths.join("|")}`,
    };
  }

  const text = snapshot.text ?? "";
  if (text) {
    return { ...empty, kind: "text", text, sig: text };
  }

  return empty;
}
