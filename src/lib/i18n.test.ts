/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { LOCALE_OPTIONS, dict, normalizeLocale, tr, type I18nKey, type Locale } from "./i18n";

const locales = LOCALE_OPTIONS.map((option) => option.value);

/**
 * Keys kept in the dictionary even though nothing references them.
 *
 * Empty on purpose: the last three were cleaned up with the command-extraction
 * feature. It stays as a list rather than being deleted because the point is to
 * make an exception explicit — and the test below fails once a listed key is
 * removed from the dictionary, which forces stale entries out of it.
 */
const KNOWN_DEAD_KEYS: I18nKey[] = [];

/**
 * Every source file except the dictionary and the tests themselves, as raw
 * text. `import.meta.glob` keeps this free of any node-only dependency, so the
 * suite still runs in the plain node environment.
 */
const sources = import.meta.glob(["../**/*.{ts,tsx}", "!../**/*.test.ts", "!./i18n.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("locale dictionaries", () => {
  it("defines exactly the same keys in every locale", () => {
    const reference = Object.keys(dict.en).sort();
    expect(reference.length).toBeGreaterThan(0);

    for (const locale of locales) {
      const keys = Object.keys(dict[locale]).sort();
      expect({ locale, missing: reference.filter((key) => !keys.includes(key)) }).toEqual({
        locale,
        missing: [],
      });
      expect({ locale, extra: keys.filter((key) => !reference.includes(key)) }).toEqual({
        locale,
        extra: [],
      });
    }
  });

  it("covers every locale listed in the picker", () => {
    expect(locales).toEqual(["zh-CN", "zh-TW", "en"]);
    expect(Object.keys(dict).sort()).toEqual([...locales].sort());
  });

  it("never stores an empty translation", () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(dict[locale])) {
        if (value.trim() === "") throw new Error(`${locale}.${key} is empty`);
      }
    }
  });
});

describe("tr", () => {
  it("resolves the key in the requested locale", () => {
    expect(tr("en", "settings")).toBe("Settings");
    expect(tr("zh-CN", "settings")).toBe("设置");
    expect(tr("zh-TW", "settings")).toBe("設定");
  });

  it("falls back to English when the active locale lacks the key", () => {
    const mutable = dict as unknown as Record<Locale, Record<string, string>>;
    const backup = mutable["zh-CN"].settings;
    delete mutable["zh-CN"].settings;
    try {
      expect(tr("zh-CN", "settings")).toBe(dict.en.settings);
    } finally {
      mutable["zh-CN"].settings = backup;
    }
  });

  it("falls back to the key itself when no locale has it", () => {
    expect(tr("zh-CN", "definitely-not-a-key" as I18nKey)).toBe("definitely-not-a-key");
  });

  it("resolves every key straight from the dictionary", () => {
    // A key that silently falls through would render as the key name (or as the
    // English string) instead of the translated label.
    for (const locale of locales) {
      for (const [key, value] of Object.entries(dict[locale])) {
        expect(tr(locale, key as I18nKey)).toBe(value);
      }
    }
  });
});

describe("normalizeLocale", () => {
  it("passes through the supported locales", () => {
    expect(normalizeLocale("zh-CN")).toBe("zh-CN");
    expect(normalizeLocale("zh-TW")).toBe("zh-TW");
    expect(normalizeLocale("en")).toBe("en");
  });

  it("defaults anything else to zh-CN", () => {
    expect(normalizeLocale(null)).toBe("zh-CN");
    expect(normalizeLocale(undefined)).toBe("zh-CN");
    expect(normalizeLocale("")).toBe("zh-CN");
    expect(normalizeLocale("fr")).toBe("zh-CN");
    expect(normalizeLocale("en-US")).toBe("zh-CN");
  });
});

describe("dictionary hygiene", () => {
  it("has no key that no source file mentions", () => {
    const haystack = Object.values(sources).join("\n");
    const mentioned = new Set(
      [...haystack.matchAll(/["'`]([A-Za-z0-9_]+)["'`]/g)].map((match) => match[1]),
    );

    const dead = (Object.keys(dict.en) as I18nKey[])
      .filter((key) => !mentioned.has(key))
      .filter((key) => !KNOWN_DEAD_KEYS.includes(key));

    expect(dead).toEqual([]);
  });

  it("has no stale entry in the dead-key list", () => {
    const stale = KNOWN_DEAD_KEYS.filter((key) => !(key in dict.en));
    expect(stale).toEqual([]);
  });

  it("scans the whole source tree", () => {
    // A silently-empty glob would make the two checks above pass for the wrong
    // reason, so pin that the scan actually saw the app's own files.
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    expect(Object.keys(sources).some((path) => path.endsWith("App.tsx"))).toBe(true);
    expect(Object.keys(sources).some((path) => path.endsWith("i18n.ts"))).toBe(false);
  });
});
