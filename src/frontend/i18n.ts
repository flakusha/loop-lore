/**
 * Frontend i18n utilities
 *
 * Shared module for locale loading, key resolution, and locale management.
 * Used by both Alpine app (chat pages) and vanilla UI (non-chat pages).
 */

import { TranslationMapSchema, } from "../validation/schemas/responses";
import { parseOr, } from "./alpine/validation";
import { feFetch, } from "./fe-fetch";

/** Supported locale IDs */
export type Locale = "en" | "es" | "fr" | "de" | "ja" | "ko" | "zh" | "pt" | "ru" | "ar";

/** Nested translation map */
export interface TranslationMap {
  [key: string]: string | TranslationMap;
}

/** All supported locales with metadata */
export const LOCALE_REGISTRY: Record<Locale, LocaleInfo> = {
  en: { id: "en", name: "English", nativeName: "English", direction: "ltr", },
  es: { id: "es", name: "Spanish", nativeName: "Español", direction: "ltr", },
  fr: { id: "fr", name: "French", nativeName: "Français", direction: "ltr", },
  de: { id: "de", name: "German", nativeName: "Deutsch", direction: "ltr", },
  ja: { id: "ja", name: "Japanese", nativeName: "日本語", direction: "ltr", },
  ko: { id: "ko", name: "Korean", nativeName: "한국어", direction: "ltr", },
  zh: { id: "zh", name: "Chinese", nativeName: "中文", direction: "ltr", },
  pt: { id: "pt", name: "Portuguese", nativeName: "Português", direction: "ltr", },
  ru: { id: "ru", name: "Russian", nativeName: "Русский", direction: "ltr", },
  ar: { id: "ar", name: "Arabic", nativeName: "العربية", direction: "rtl", },
};

/** Default locale */
export const DEFAULT_LOCALE: Locale = "en";

/** All supported locale IDs */
export const SUPPORTED_LOCALES = Object.keys(LOCALE_REGISTRY,) as Locale[];

/** Locale metadata */
export interface LocaleInfo {
  id: Locale;
  name: string;
  nativeName: string;
  direction: "ltr" | "rtl";
}

/**
 * Resolve a dot-notation key against a nested translation map.
 *
 * @example
 * resolveKey({ common: { save: "Save" } }, "common.save") // => "Save"
 * resolveKey({ common: { save: "Save" } }, "missing") // => undefined
 */
export function resolveKey(
  map: TranslationMap,
  key: string,
): string | undefined {
  if (typeof key !== "string") { return undefined; }
  const parts = key.split(".",);
  let current: TranslationMap | string = map;

  for (const part of parts) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    const next: string | TranslationMap = current[part] as string | TranslationMap;
    if (next === undefined) {
      return undefined;
    }
    current = next;
  }

  return typeof current === "string" ? current : undefined;
}

/**
 * Flatten a nested translation map into dot-notation keys.
 *
 * @example
 * flattenTranslations({ common: { save: "Save" } })
 * // => Map { "common.save" => "Save" }
 */
export function flattenTranslations(
  map: TranslationMap,
  prefix = "",
): Map<string, string> {
  const result = new Map<string, string>();

  for (const [key, value,] of Object.entries(map,)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      result.set(fullKey, value,);
    } else if (typeof value === "object" && value !== null) {
      for (const [nestedKey, nestedValue,] of flattenTranslations(value, fullKey,)) {
        result.set(nestedKey, nestedValue,);
      }
    }
  }

  return result;
}

/** Match {param} placeholders for interpolation. */
export const INTERPOLATE_RE = /\{(\w+)\}/g;

/**
 * Interpolate {param} placeholders in a translated string.
 *
 * @example
 * interpolate("Hello {name}", { name: "World" }) // => "Hello World"
 */
export function interpolate(
  template: string,
  params: Record<string, string>,
): string {
  return template.replaceAll(INTERPOLATE_RE, (_, name,) => params[name] ?? `{${name}}`,);
}

/**
 * Load translations for a locale from the server.
 *
 * @returns The nested translation map, or null on failure.
 */
export async function loadTranslations(locale: string,): Promise<TranslationMap | null> {
  try {
    const res = await feFetch(`/locales/${locale}.json`,);
    if (res.ok) {
      const raw = await res.json();
      const strings = parseOr(TranslationMapSchema, raw, null as unknown as TranslationMap,) as TranslationMap | null;
      return strings;
    }
  } catch {
    // network error or invalid JSON
  }
  return null;
}

/**
 * Detect saved locale from localStorage.
 * Returns the saved locale if valid, otherwise the default.
 */
export function getSavedLocale(): Locale {
  const saved = localStorage.getItem("locale",);
  if (saved && (SUPPORTED_LOCALES as string[]).includes(saved,)) {
    return saved as Locale;
  }
  return DEFAULT_LOCALE;
}

/**
 * Save locale preference to localStorage and set cookie for server.
 */
export function saveLocale(locale: Locale,): void {
  localStorage.setItem("locale", locale,);
  // Cookie for server-side detection (middleware reads this)
  // eslint-disable-next-line unicorn/no-document-cookie
  document.cookie = `ll_locale=${locale}; path=/; SameSite=Lax; max-age=31536000`;
  // Update global ref
  globalThis.currentLocale = locale;
  // Set HTML dir attribute for RTL
  const info = LOCALE_REGISTRY[locale];
  if (info) {
    document.documentElement.dir = info.direction;
    document.documentElement.lang = locale;
  }
}

/**
 * Apply RTL direction based on locale.
 */
export function applyDirection(locale: Locale,): void {
  const info = LOCALE_REGISTRY[locale];
  if (info) {
    document.documentElement.dir = info.direction;
    document.documentElement.lang = locale;
  }
}

/**
 * Create a translator function from loaded translations.
 * Uses dot-notation key resolution with fallback.
 *
 * @param translations - The nested translation map.
 * @param fallbackLocale - Fallback translations (optional).
 * @returns A translator function.
 */
export function createFrontendTranslator(
  translations: TranslationMap,
  fallbackLocale?: TranslationMap,
) {
  return function t(key: string, params?: Record<string, string>,): string {
    let value = resolveKey(translations, key,);
    if (value === undefined && fallbackLocale) {
      value = resolveKey(fallbackLocale, key,);
    }
    if (value === undefined) {
      return key;
    }
    if (params) {
      return interpolate(value, params,);
    }
    return value;
  };
}
