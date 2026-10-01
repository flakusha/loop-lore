// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Translator
 *
 * Creates translator functions from nested translation maps.
 * Supports nested key lookup, plural selection, interpolation, and fallback chains.
 */

import { pluralRuleFor, } from "./plurals";
import type { PluralRuleFn, } from "./plurals";
import type { FlatTranslationMap, Locale, TranslationMap, TranslationNode, TranslatorFn, } from "./types";

/** Every CLDR plural category `Intl.PluralRules.select` can return. */
const PLURAL_CATEGORIES: Record<string, true> = {
  zero: true,
  one: true,
  two: true,
  few: true,
  many: true,
  other: true,
};

/**
 * A node is plural-variant data when every one of its keys is a CLDR category.
 * Requiring ALL keys to be categories is what keeps a plain enumeration such as
 * `chat.flagReason` (`inappropriate`/`spam`/`other`/...) a normal subtree.
 * @param node - candidate translation node
 * @returns true when the node is a plural-variant object.
 */
function isPluralNode(node: TranslationNode | TranslationMap,): node is Exclude<TranslationNode, string> {
  if (typeof node !== "object" || node === null) { return false; }
  const keys = Object.keys(node,);
  return keys.length > 0 && keys.every((key,) => PLURAL_CATEGORIES[key] === true,);
}

/**
 * Flatten a nested translation map into dot-notation keys.
 *
 * Plural-variant objects are LEAVES: the walk stops there and stores the whole
 * variant object under its own key, so `inventory.item` resolves to a
 * `PluralTranslation` instead of `inventory.item.one` / `inventory.item.other`.
 * @param map - nested `TranslationMap`
 * @returns flat map of `"a.b.c"` keys to string or plural-variant values.
 * @example
 * flatten({ auth: { login: "Log In" } })
 * // => Map { "auth.login" => "Log In" }
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

/**
 * Pick the variant for `category` from a plural node.
 *
 * Falls back to the CLDR-required `other` when the selected category is absent
 * from the catalog, so a partial plural table still renders instead of leaking
 * `undefined` into the output.
 * @param variants - plural-variant entry stored for the key
 * @param category - category chosen by the locale's plural rule
 * @returns the variant string.
 */
function selectVariant(
  variants: Exclude<TranslationNode, string>,
  category: string,
): string {
  const selected = variants[category as keyof typeof variants];
  if (typeof selected === "string") { return selected; }
  return variants.other;
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
 * @param options - map, key, and optional plural-selection inputs.
 * @returns translated string, or `undefined` if the key is not present.
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
    return value === undefined ? match : String(value);
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
 *
 * Lookup order:
 * 1. Primary translations (user's locale)
 * 2. Fallback translations (e.g., English)
 * 3. Raw key (return key as-is)
 *
 * When `params.count` is a number and the resolved entry is a plural-variant
 * object, `count` picks the category through the locale's `Intl.PluralRules`
 * (`pluralRuleFor(locale)`, or an explicit `pluralRule` override). A missing
 * category falls back to `other`; a primary entry that is a plain string is
 * returned as-is even when a count is supplied.
 * @param options - primary + optional fallback translations, locale, optional plural rule
 * @returns a `TranslatorFn(key, params?)` returning the resolved string.
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
