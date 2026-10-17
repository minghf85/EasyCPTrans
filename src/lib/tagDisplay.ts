import type { Locale } from "./i18n";
import { tr, type I18nKey } from "./i18n";

/**
 * Map from English tag name to its i18n key for localized display.
 *
 * Tags are stored in English in the backend but displayed in the user's language.
 * This covers both system/functional tags and quick-rule preset tags.
 */
const TAG_DISPLAY_NAME_MAP: Record<string, I18nKey> = {
  // System / functional tags
  Text: "text",
  Image: "image",
  File: "file",
  Word: "word",
  Private: "private",
  Pinned: "pinned",
  OCR: "ocr",
  // Quick-rule preset tags
  Link: "tagPresetLink",
  Email: "tagPresetEmail",
  Phone: "tagPresetPhone",
  Path: "tagPresetPath",
  IP: "tagPresetIp",
  Color: "tagPresetColor",
};

/**
 * Get the localized display name for a tag.
 *
 * Tags are stored in English (e.g., "Text") but displayed in the user's language
 * (e.g., "文本" in Chinese). For tags not in the map, returns the original name.
 */
export function getTagDisplayName(tagName: string, locale: Locale): string {
  const key = TAG_DISPLAY_NAME_MAP[tagName];
  return key ? tr(locale, key) : tagName;
}

/**
 * All reserved tag names (lowercased) that users cannot create as custom tags.
 * Includes system/functional tags and quick-rule preset tags.
 */
const RESERVED_NAMES_LOWER = new Set([
  // system / functional
  "text", "image", "file", "word", "private", "privacy", "pinned", "ocr",
  // quick-rule presets
  "link", "email", "phone", "path", "ip", "color",
]);

/**
 * Check if a tag name (case-insensitive) is reserved by the system.
 * Users cannot create custom tags with these names.
 */
export function isReservedTagName(name: string): boolean {
  return RESERVED_NAMES_LOWER.has(name.toLowerCase());
}

/**
 * All localized display names for the current locale (lowercased).
 * Used to prevent users from creating a custom tag whose display name
 * would collide with a system tag's localized display.
 */
export function getLocalizedReservedNames(locale: Locale): string[] {
  return Object.keys(TAG_DISPLAY_NAME_MAP).map((english) =>
    getTagDisplayName(english, locale),
  );
}
