// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Locale Registry
 *
 * Metadata for all supported locales.
 */

import type { Locale, LocaleInfo, } from "./types";

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

/**
 * Get locale info by ID.
 * Returns undefined for unknown locales.
 */
export function getLocaleInfo(locale: Locale,): LocaleInfo | undefined {
  return LOCALE_REGISTRY[locale];
}

/**
 * Check if a string is a supported locale ID.
 */
export function isLocale(value: string,): value is Locale {
  return value in LOCALE_REGISTRY;
}

/**
 * Get all supported locale IDs.
 */
export function getSupportedLocales(): Locale[] {
  return Object.keys(LOCALE_REGISTRY,) as Locale[];
}
