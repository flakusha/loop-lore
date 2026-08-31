// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Locale Loader
 *
 * Loads and caches locale files from the filesystem.
 * Server-side only (uses fs).
 */

import { readFileSync, } from "node:fs";
import { join, } from "node:path";
import { jsonParseOr, } from "../utils";
import { flattenTranslations, } from "./translator";
import type { FlatTranslationMap, Locale, TranslationMap, } from "./types";

/** In-memory cache: locale → flattened translations */
const localeCache = new Map<Locale, FlatTranslationMap>();

/** Raw nested cache (for export) */
const rawCache = new Map<Locale, TranslationMap>();

/** Path to locales directory */
const LOCALES_DIR = join(import.meta.dir, "../public/locales",);

/**
 * Load a locale file and cache it.
 * Returns flattened translations for immediate use.
 * @param locale
 */
export function loadLocale(locale: Locale,): FlatTranslationMap {
  const cached = localeCache.get(locale,);
  if (cached) { return cached; }

  try {
    const filePath = join(LOCALES_DIR, `${locale}.json`,);
    const raw = readFileSync(filePath, "utf8",);
    const translations = jsonParseOr<TranslationMap>(raw, {},);

    rawCache.set(locale, translations,);
    const flat = flattenTranslations(translations,);
    localeCache.set(locale, flat,);

    return flat;
  } catch {
    // Return empty map on load failure (fallback chain handles missing locales)
    return new Map();
  }
}

/**
 * Load locale synchronously (same as loadLocale, but explicit naming).
 * @param locale
 */
export function loadLocaleSync(locale: Locale,): FlatTranslationMap {
  return loadLocale(locale,);
}

/**
 * Get raw nested translations for a locale (used by export tools).
 * @param locale
 */
export function getRawTranslations(locale: Locale,): TranslationMap | undefined {
  if (!rawCache.has(locale,)) {
    loadLocale(locale,);
  }
  return rawCache.get(locale,);
}

/**
 * Clear the locale cache (for testing).
 */
export function clearLocaleCache(): void {
  localeCache.clear();
  rawCache.clear();
}
