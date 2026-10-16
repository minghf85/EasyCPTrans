import { describe, expect, it } from "vitest";
import { fileBasename, fileExtension, fileKindFor, fileParentDir } from "./fileIcons";

describe("fileBasename", () => {
  it("returns the final segment for both separator styles", () => {
    expect(fileBasename("C:\\Users\\me\\report.pdf")).toBe("report.pdf");
    expect(fileBasename("/home/me/report.pdf")).toBe("report.pdf");
    expect(fileBasename("C:/Users/me/report.pdf")).toBe("report.pdf");
  });

  it("returns the whole string when there is no directory part", () => {
    expect(fileBasename("report.pdf")).toBe("report.pdf");
  });

  it("ignores trailing separators", () => {
    expect(fileBasename("C:\\Users\\me\\")).toBe("me");
    expect(fileBasename("/home/me//")).toBe("me");
  });

  it("keeps dotfiles intact", () => {
    expect(fileBasename("/home/me/.gitignore")).toBe(".gitignore");
  });
});

describe("fileParentDir", () => {
  it("returns everything before the final segment", () => {
    expect(fileParentDir("C:\\Users\\me\\report.pdf")).toBe("C:\\Users\\me");
    expect(fileParentDir("/home/me/report.pdf")).toBe("/home/me");
  });

  it("returns an empty string for a bare filename", () => {
    expect(fileParentDir("report.pdf")).toBe("");
  });

  it("keeps a drive root", () => {
    expect(fileParentDir("C:\\report.pdf")).toBe("C:");
  });
});

describe("fileExtension", () => {
  it("lowercases the extension and drops the dot", () => {
    expect(fileExtension("Report.PDF")).toBe("pdf");
    expect(fileExtension("archive.tar.GZ")).toBe("gz");
  });

  it("returns an empty string when there is no extension", () => {
    expect(fileExtension("Makefile")).toBe("");
    expect(fileExtension("a.")).toBe("");
  });

  it("treats a leading dot as a dotfile, not an extension", () => {
    expect(fileExtension(".gitignore")).toBe("");
  });
});

describe("fileKindFor", () => {
  it("maps each extension family to its label", () => {
    expect(fileKindFor("a.png")).toBe(fileKindFor("a.JPEG"));
    expect(fileKindFor("a.png").label).toBe("Image");
    expect(fileKindFor("a.mp4").label).toBe("Video");
    expect(fileKindFor("a.mp3").label).toBe("Audio");
    expect(fileKindFor("a.zip").label).toBe("Archive");
    expect(fileKindFor("a.ts").label).toBe("Code");
    expect(fileKindFor("a.html").label).toBe("Web");
    expect(fileKindFor("a.json").label).toBe("Data");
  });

  it("reads the extension from the basename only", () => {
    // The directory name must not leak into the extension lookup.
    expect(fileKindFor("C:\\report.pdf\\notes")).toBe(fileKindFor("notes"));
  });

  it("falls back to the generic file kind", () => {
    const unknown = fileKindFor("a.qqq").label;
    expect(unknown).toBe("File");
    expect(fileKindFor("noextension").label).toBe(unknown);
    expect(fileKindFor(".gitignore").label).toBe(unknown);
    expect(fileKindFor("trailingdot.").label).toBe(unknown);
  });

  it("is case-insensitive", () => {
    expect(fileKindFor("SHOT.PNG").label).toBe("Image");
  });
});
