import { describe, expect, it } from "vitest";
import { classifyClipboard, looksLikeImagePath } from "./clipboardPayload";

describe("looksLikeImagePath", () => {
  it("recognises the formats the backend can label", () => {
    for (const path of ["a.png", "a.PNG", "a.jpg", "a.jpeg", "a.gif", "a.bmp", "a.webp"]) {
      expect({ path, image: looksLikeImagePath(path) }).toEqual({ path, image: true });
    }
  });

  it("rejects documents and archives", () => {
    for (const path of ["a.pdf", "a.txt", "a.zip", "a.mp4", "a"]) {
      expect({ path, image: looksLikeImagePath(path) }).toEqual({ path, image: false });
    }
  });

  it("reads the extension, not the directory", () => {
    expect(looksLikeImagePath("C:\\images.png\\notes.txt")).toBe(false);
    expect(looksLikeImagePath("C:\\notes\\photo.jpg")).toBe(true);
  });

  it("rejects a dotfile and a trailing dot", () => {
    expect(looksLikeImagePath("/home/me/.gitignore")).toBe(false);
    expect(looksLikeImagePath("C:\\weird.")).toBe(false);
  });
});

describe("classifyClipboard", () => {
  const bitmap = { value: "C:\\temp\\clip.png", width: 800, height: 600 };

  it("calls a bitmap an image", () => {
    expect(classifyClipboard({ image: bitmap })).toMatchObject({
      kind: "image",
      image: { fromClipboard: bitmap },
      sig: `img_800x600_${bitmap.value}`,
    });
  });

  it("still calls it an image when a file path came along", () => {
    // The bug this module exists for: Windows offers both, and the path used to
    // win — filing every copied screenshot as a `file`.
    const classified = classifyClipboard({ image: bitmap, files: ["C:\\temp\\clip.png"] });

    expect(classified.kind).toBe("image");
    expect(classified.image).toEqual({ fromClipboard: bitmap });
  });

  it("calls a lone image file an image", () => {
    expect(classifyClipboard({ files: ["C:\\shots\\one.PNG"] })).toMatchObject({
      kind: "image",
      image: { fromPath: "C:\\shots\\one.PNG" },
      sig: "imgfile_C:\\shots\\one.PNG",
    });
  });

  it("keeps a bundle of files as files, images included", () => {
    // Dropping the picture out of a mixed selection would lose part of what the
    // user asked to keep.
    const classified = classifyClipboard({
      files: ["C:\\a.png", "C:\\b.pdf", "C:\\c.txt"],
    });

    expect(classified.kind).toBe("files");
    expect(classified.paths).toEqual(["C:\\a.png", "C:\\b.pdf", "C:\\c.txt"]);
    expect(classified.sig).toBe("files_C:\\a.png|C:\\b.pdf|C:\\c.txt");
  });

  it("treats two images as a file bundle, not a picture", () => {
    expect(classifyClipboard({ files: ["a.png", "b.png"] }).kind).toBe("files");
  });

  it("prefers a bitmap over text", () => {
    expect(classifyClipboard({ image: bitmap, text: "hello" }).kind).toBe("image");
  });

  it("prefers a file list over text", () => {
    // The clipboard always carries a text rendering of the paths alongside them.
    expect(classifyClipboard({ files: ["C:\\a.pdf"], text: "C:\\a.pdf" }).kind).toBe("files");
  });

  it("uses the text only when it is all there is", () => {
    expect(classifyClipboard({ text: "hello" })).toMatchObject({ kind: "text", text: "hello", sig: "hello" });
  });

  it("is empty for an empty clipboard", () => {
    expect(classifyClipboard({})).toMatchObject({ kind: "none", sig: "" });
    expect(classifyClipboard({ files: [] })).toMatchObject({ kind: "none" });
    expect(classifyClipboard({ text: "" })).toMatchObject({ kind: "none" });
    expect(classifyClipboard({ image: { value: "", width: 0, height: 0 } })).toMatchObject({
      kind: "none",
    });
  });

  it("ignores a bitmap with no staged file", () => {
    // The plugin reports a size before it has written the temp file; classifying
    // it as an image then would ingest nothing.
    expect(classifyClipboard({ image: { value: "", width: 10, height: 10 } }).kind).toBe("none");
  });

  it("gives each payload shape its own signature", () => {
    const sigs = [
      classifyClipboard({ image: bitmap }).sig,
      classifyClipboard({ files: ["C:\\shots\\one.png"] }).sig,
      classifyClipboard({ files: ["a.pdf"] }).sig,
      classifyClipboard({ text: "hello" }).sig,
    ];

    expect(new Set(sigs).size).toBe(sigs.length);
  });
});
