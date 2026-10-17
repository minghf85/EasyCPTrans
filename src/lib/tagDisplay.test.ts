import { describe, expect, it } from "vitest";
import { getTagDisplayName, getLocalizedReservedNames, isReservedTagName } from "./tagDisplay";

describe("getTagDisplayName", () => {
  it("returns the Chinese name for system tags in zh-CN", () => {
    expect(getTagDisplayName("Text", "zh-CN")).toBe("文本");
    expect(getTagDisplayName("Image", "zh-CN")).toBe("图片");
    expect(getTagDisplayName("File", "zh-CN")).toBe("文件");
    expect(getTagDisplayName("Link", "zh-CN")).toBe("链接");
    expect(getTagDisplayName("Email", "zh-CN")).toBe("邮箱");
    expect(getTagDisplayName("Phone", "zh-CN")).toBe("电话号码");
    expect(getTagDisplayName("Path", "zh-CN")).toBe("文件路径");
    expect(getTagDisplayName("IP", "zh-CN")).toBe("IP 地址");
    expect(getTagDisplayName("Color", "zh-CN")).toBe("颜色值");
    expect(getTagDisplayName("Word", "zh-CN")).toBe("单词");
    expect(getTagDisplayName("Private", "zh-CN")).toBe("私密");
    expect(getTagDisplayName("Pinned", "zh-CN")).toBe("置顶");
  });

  it("returns the Traditional Chinese name for system tags in zh-TW", () => {
    expect(getTagDisplayName("Link", "zh-TW")).toBe("連結");
    expect(getTagDisplayName("Email", "zh-TW")).toBe("電子郵件");
    expect(getTagDisplayName("Phone", "zh-TW")).toBe("電話號碼");
    expect(getTagDisplayName("Path", "zh-TW")).toBe("檔案路徑");
    expect(getTagDisplayName("IP", "zh-TW")).toBe("IP 位址");
    expect(getTagDisplayName("Color", "zh-TW")).toBe("顏色值");
  });

  it("returns the English name for system tags in en", () => {
    expect(getTagDisplayName("Text", "en")).toBe("Text");
    expect(getTagDisplayName("Link", "en")).toBe("Link");
    expect(getTagDisplayName("Email", "en")).toBe("Email");
    expect(getTagDisplayName("Phone", "en")).toBe("Phone number");
    expect(getTagDisplayName("Path", "en")).toBe("File path");
    expect(getTagDisplayName("IP", "en")).toBe("IP address");
    expect(getTagDisplayName("Color", "en")).toBe("Color value");
  });

  it("returns the original name for unknown tags", () => {
    expect(getTagDisplayName("MyCustomTag", "zh-CN")).toBe("MyCustomTag");
    expect(getTagDisplayName("Work", "en")).toBe("Work");
    expect(getTagDisplayName("项目", "zh-CN")).toBe("项目");
  });
});

describe("isReservedTagName", () => {
  it("reserves system tag names (case-insensitive)", () => {
    expect(isReservedTagName("Text")).toBe(true);
    expect(isReservedTagName("text")).toBe(true);
    expect(isReservedTagName("TEXT")).toBe(true);
    expect(isReservedTagName("Image")).toBe(true);
    expect(isReservedTagName("File")).toBe(true);
    expect(isReservedTagName("Private")).toBe(true);
    expect(isReservedTagName("Pinned")).toBe(true);
    expect(isReservedTagName("Word")).toBe(true);
    expect(isReservedTagName("OCR")).toBe(true);
    expect(isReservedTagName("Privacy")).toBe(true);
  });

  it("reserves quick-rule preset names (case-insensitive)", () => {
    expect(isReservedTagName("Link")).toBe(true);
    expect(isReservedTagName("link")).toBe(true);
    expect(isReservedTagName("Email")).toBe(true);
    expect(isReservedTagName("Phone")).toBe(true);
    expect(isReservedTagName("Path")).toBe(true);
    expect(isReservedTagName("IP")).toBe(true);
    expect(isReservedTagName("Color")).toBe(true);
    expect(isReservedTagName("color")).toBe(true);
  });

  it("allows custom tag names", () => {
    expect(isReservedTagName("MyTag")).toBe(false);
    expect(isReservedTagName("Work")).toBe(false);
    expect(isReservedTagName("项目")).toBe(false);
    expect(isReservedTagName("")).toBe(false);
  });
});

describe("getLocalizedReservedNames", () => {
  it("returns all localized display names for zh-CN", () => {
    const names = getLocalizedReservedNames("zh-CN");
    expect(names).toContain("链接");
    expect(names).toContain("邮箱");
    expect(names).toContain("电话号码");
    expect(names).toContain("文件路径");
    expect(names).toContain("IP 地址");
    expect(names).toContain("颜色值");
  });

  it("returns all localized display names for en", () => {
    const names = getLocalizedReservedNames("en");
    expect(names).toContain("Link");
    expect(names).toContain("Email");
    expect(names).toContain("Phone number");
    expect(names).toContain("File path");
    expect(names).toContain("IP address");
    expect(names).toContain("Color value");
  });
});
