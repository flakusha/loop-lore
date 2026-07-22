/**
 * i18n Types
 *
 * Core types for the internationalization system.
 */

/** Supported locales */
export type Locale = "en" | "es" | "fr" | "de" | "ja" | "ko" | "zh" | "pt" | "ru" | "ar";

/** Nested translation map structure */
export interface TranslationMap {
  [key: string]: string | TranslationMap;
}

/** Flat translation cache (dot-notation keys) */
export type FlatTranslationMap = Map<string, string>;

/** Translator function signature */
export type TranslatorFn = (key: string, params?: Record<string, string>,) => string;

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
