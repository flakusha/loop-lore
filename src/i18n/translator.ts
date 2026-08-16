// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Translator
 *
 * Creates translator functions from nested translation maps.
 * Supports nested key lookup, interpolation, and fallback chains.
 */

import type { FlatTranslationMap, Locale, TranslationMap, TranslatorFn, } from "./types";

/**
 * Flatten a nested translation map into dot-notation keys.
 *
 * @example
 * flatten({ auth: { login: "Log In" } })
 * // => Map { "auth.login" => "Log In" }
 */
export function flattenTranslations(map: TranslationMap,): FlatTranslationMap {
  const flat = new Map<string, string>();
  const prefix = "";

  function walk(node: TranslationMap, path: string,): void {
    for (const [key, value,] of Object.entries(node,)) {
      const fullPath = path ? `${path}.${key}` : key;
      if (typeof value === "string") {
        flat.set(fullPath, value,);
      } else {
        walk(value, fullPath,);
      }
    }
  }

  walk(map, prefix,);
  return flat;
}

/**
 * Resolve a dot-notation key from a flat translation map.
 */
export function resolveKey(
  translations: FlatTranslationMap,
  key: string,
): string | undefined {
  return translations.get(key,);
}

/**
 * Interpolate params into a translated string.
 *
 * Supports {paramName} syntax.
 *
 * @example
 * interpolate("Hello, {name}!", { name: "World" })
 * // => "Hello, World!"
 */
export function interpolate(
  template: string,
  params: Record<string, string>,
): string {
  return template.replaceAll(/\{(\w+)\}/g, (match, paramName,) => {
    return params[paramName] ?? match;
  },);
}

export interface TranslatorOptions {
  /** Primary locale translations (flattened) */
  primary: FlatTranslationMap;
  /** Fallback locale translations (flattened) */
  fallback?: FlatTranslationMap;
  /** The locale this translator serves (for metadata) */
  locale: Locale;
}

/**
 * Create a translator function.
 *
 * Lookup order:
 * 1. Primary translations (user's locale)
 * 2. Fallback translations (e.g., English)
 * 3. Raw key (return key as-is)
 */
export function createTranslator(options: TranslatorOptions,): TranslatorFn {
  const { primary, fallback, } = options;

  return (key: string, params?: Record<string, string>,): string => {
    // 1. Try primary locale
    let value = resolveKey(primary, key,);

    // 2. Try fallback
    if (value === undefined && fallback) {
      value = resolveKey(fallback, key,);
    }

    // 3. Return key as last resort
    const result = value ?? key;

    // Interpolate params if provided
    return params ? interpolate(result, params,) : result;
  };
}
