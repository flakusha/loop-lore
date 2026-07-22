/**
 * i18n Middleware
 *
 * Detects locale from request and provides translator function.
 * Detection priority: Cookie → Accept-Language → default
 */

import { loadLocale, } from "../i18n/locale-loader";
import { isLocale, } from "../i18n/locale-registry";
import { createTranslator, } from "../i18n/translator";
import { DEFAULT_I18N_CONFIG, } from "../i18n/types";
import type { I18nConfig, Locale, } from "../i18n/types";

/**
 * Parse Accept-Language header and extract locale preferences.
 *
 * @example
 * parseAcceptLanguage("ja,en-US;q=0.9,en;q=0.8")
 * // => ["ja", "en-US", "en"]
 */
export function parseAcceptLanguage(header: string,): string[] {
  const result: string[] = [];
  for (const part of header.split(",",)) {
    const [lang,] = part.trim().split(";",);
    const trimmed = lang?.trim();
    if (trimmed !== undefined && trimmed.length > 0) {
      result.push(trimmed,);
    }
  }
  return result;
}

/**
 * Detect locale from request.
 *
 * Priority:
 * 1. Cookie: ll_locale=xx
 * 2. Accept-Language header (parse q-values)
 * 3. Server default
 */
export function detectLocale(
  request: Request,
  config: I18nConfig = DEFAULT_I18N_CONFIG,
): Locale {
  return detectFromCookie(request, config,) ??
    detectFromAcceptLanguage(request, config,) ??
    config.defaultLocale;
}

/**
 * Try to detect locale from ll_locale cookie.
 */
function detectFromCookie(
  request: Request,
  config: I18nConfig,
): Locale | undefined {
  const cookieHeader = request.headers.get("Cookie",);
  if (!cookieHeader) { return undefined; }

  const match = /(?:^|;\s*)ll_locale=([a-z]{2})/.exec(cookieHeader,);
  if (match?.[1]) {
    const locale = match[1].toLowerCase() as Locale;
    if (isLocale(locale,) && config.supportedLocales.includes(locale,)) {
      return locale;
    }
  }

  return undefined;
}

/**
 * Try to detect locale from Accept-Language header.
 */
function detectFromAcceptLanguage(
  request: Request,
  config: I18nConfig,
): Locale | undefined {
  const acceptLang = request.headers.get("Accept-Language",);
  if (!acceptLang) { return undefined; }

  const parsed = parseAcceptLanguage(acceptLang,);
  for (const lang of parsed) {
    const shortLang = (lang.toLowerCase().split("-", 1,)[0] ?? lang.toLowerCase()) as Locale;
    if (isLocale(shortLang,) && config.supportedLocales.includes(shortLang,)) {
      return shortLang;
    }

    if (isLocale(shortLang,)) {
      const fallback = config.fallbackMap[shortLang];
      if (fallback !== undefined && config.supportedLocales.includes(fallback,)) {
        return fallback;
      }
    }
  }

  return undefined;
}

/**
 * Create i18n context for a request.
 * Loads translations and creates translator function.
 */
export function createI18nContext(
  locale: Locale,
  config: I18nConfig = DEFAULT_I18N_CONFIG,
) {
  const primary = loadLocale(locale,);

  // Load fallback if different from primary
  const fallbackLocale = config.fallbackMap[locale] ?? config.defaultLocale;
  const fallback = fallbackLocale === locale ? undefined : loadLocale(fallbackLocale,);

  const t = createTranslator({ primary, fallback, locale, },);

  return { locale, t, };
}
