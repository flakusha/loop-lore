// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * i18n Types
 *
 * Core types for the internationalization system.
 */

/** Supported locales */
export type Locale = "en" | "es" | "fr" | "de" | "ja" | "ko" | "zh" | "pt" | "ru" | "ar";

/** CLDR plural category, as produced by `Intl.PluralRules.select`. */
export type PluralCategory = Intl.LDMLPluralRule;

/**
 * Per-key plural variants. `other` is required; the rest are locale-dependent.
 */
export interface PluralTranslation {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

/** A translation node: either a plain string or a plural-variant object. */
export type TranslationNode = string | PluralTranslation;

/** Nested translation map structure */
export interface TranslationMap {
  [key: string]: TranslationNode | TranslationMap;
}

/** Flat translation cache (dot-notation keys). */
export type FlatTranslationMap = Map<string, TranslationNode>;

/**
 * Translator function signature.
 * A numeric `params.count` drives plural selection for plural-variant entries.
 */
export type TranslatorFn = (key: string, params?: Record<string, string | number>,) => string;

/** Locale metadata */
export interface LocaleInfo {
  id: Locale;
  name: string;
  nativeName: string;
  direction: "ltr" | "rtl";
}

/** i18n configuration */
export interface I18nConfig {
  /** Default locale when none detected */
  defaultLocale: Locale;
  /** Fallback chain: { ja: "en", de: "fr" } means Japanese falls back to English, German to French */
  fallbackMap: Partial<Record<Locale, Locale>>;
  /** All supported locales */
  supportedLocales: Locale[];
}

/** Default i18n configuration */
export const DEFAULT_I18N_CONFIG: I18nConfig = {
  defaultLocale: "en",
  fallbackMap: {
    ja: "en",
    ko: "en",
    zh: "en",
    es: "en",
    fr: "en",
    de: "fr",
    pt: "es",
    ru: "en",
    ar: "en",
  },
  supportedLocales: ["en", "es", "fr", "de", "ja", "ko", "zh", "pt", "ru", "ar",],
};
