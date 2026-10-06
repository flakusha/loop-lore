// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Translator
 *
 * Creates translator functions from nested translation maps.
 * Supports nested key lookup, plural selection, interpolation, and fallback chains.
 */

// `isPluralNode` + `selectVariant` are shared with the browser-side resolver in
// `src/frontend/i18n.ts` — both import them from here (see `src/i18n/plurals.ts`)
// so the server and the browser can never disagree about which node is plural.
import { isPluralNode, pluralRuleFor, selectVariant, } from "./plurals";
import type { PluralRuleFn, } from "./plurals";
import type { FlatTranslationMap, Locale, TranslationMap, TranslationNode, TranslatorFn, } from "./types";

/**
 * Flatten a nested translation map into dot-notation keys.
 * Plural-variant objects are LEAVES: the walk stops there and stores the whole
 * variant object under its own key.
 * @param map
 */
export function flattenTranslations(map: TranslationMap,): FlatTranslationMap {
  const flat = new Map<string, TranslationNode>();
  const prefix = "";

  /**
   * @param node - current subtree
   * @param path - dot-accumulated key path
   */
  function walk(node: TranslationMap, path: string,): void {
    for (const [key, value,] of Object.entries(node,)) {
      const fullPath = path ? `${path}.${key}` : key;
      if (typeof value === "string" || isPluralNode(value,)) {
        flat.set(fullPath, value,);
      } else {
        walk(value, fullPath,);
      }
    }
  }

  walk(map, prefix,);
  return flat;
}

/** Options for {@link resolveKey}. */
export interface ResolveKeyOptions {
  /** Flat translation map to read from. */
  translations: FlatTranslationMap;
  /** Dot-notation key (e.g. `"auth.login"`). */
  key: string;
  /** Count driving plural-category selection, when the key has plural variants. */
  count?: number;
  /** Locale plural rule. Omit to take the `other` variant unconditionally. */
  rule?: PluralRuleFn;
}

/**
 * Resolve a dot-notation key from a flat translation map.
 * @param options
 */
export function resolveKey(options: ResolveKeyOptions,): string | undefined {
  const { translations, key, count, rule, } = options;
  const node = translations.get(key,);
  if (node === undefined) { return undefined; }
  if (typeof node === "string") { return node; }
  if (count === undefined || !rule) { return node.other; }
  return selectVariant(node, rule(count,),);
}

/**
 * Interpolate params into a translated string.
 *
 * Supports `{paramName}` syntax; unmatched placeholders are left literal.
 * @param template - translated string with `{name}` placeholders
 * @param params - substitution map
 * @returns interpolated string.
 * @example
 * interpolate("Hello, {name}!", { name: "World" })
 * // => "Hello, World!"
 */
export function interpolate(
  template: string,
  params: Record<string, string | number>,
): string {
  return template.replaceAll(/\{(\w+)\}/g, (match, paramName,) => {
    const value = params[paramName];
    return value === undefined ? match : String(value,);
  },);
}

/** Options for {@link createTranslator}. */
export interface TranslatorOptions {
  /** Primary locale translations (flattened) */
  primary: FlatTranslationMap;
  /** Fallback locale translations (flattened) */
  fallback?: FlatTranslationMap;
  /** The locale this translator serves (for metadata) */
  locale: Locale;
  /**
   * Plural-category selector. Defaults to the `Intl.PluralRules` rule for
   * `locale`; override to inject a different CLDR rule or a test double.
   */
  pluralRule?: PluralRuleFn;
}

/**
 * Create a translator function.
 * Lookup order: primary, fallback, raw key.
 * A numeric `params.count` picks the plural category via `Intl.PluralRules`.
 * @param options
 */
export function createTranslator(options: TranslatorOptions,): TranslatorFn {
  const { primary, fallback, locale, pluralRule, } = options;
  const rule = pluralRule ?? pluralRuleFor(locale,);

  return (key: string, params?: Record<string, string | number>,): string => {
    const count = params?.count;
    const pluralCount = typeof count === "number" ? count : undefined;

    // 1. Try primary locale, 2. then fallback — the same plural selection
    // applies to both so a fallback catalog still renders the right variant.
    let value = resolveKey({ translations: primary, key, count: pluralCount, rule, },);
    if (value === undefined && fallback) {
      value = resolveKey({ translations: fallback, key, count: pluralCount, rule, },);
    }

    // 3. Return key as last resort
    const result = value ?? key;

    return params ? interpolate(result, params,) : result;
  };
}
