// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * i18n Module
 *
 * Public API for internationalization.
 */

export { DEFAULT_I18N_CONFIG, } from "./types";
export type {
  FlatTranslationMap,
  I18nConfig,
  Locale,
  LocaleInfo,
  TranslationMap,
  TranslatorFn,
} from "./types";

export {
  getLocaleInfo,
  getSupportedLocales,
  isLocale,
  LOCALE_REGISTRY,
} from "./locale-registry";

export {
  createTranslator,
  flattenTranslations,
  interpolate,
  resolveKey,
} from "./translator";
export type { TranslatorOptions, } from "./translator";

// Re-export locale loading (server-side only)
export { clearLocaleCache, getRawTranslations, loadLocale, loadLocaleSync, } from "./locale-loader";
