// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plural Rules
 *
 * CLDR plural-category selection delegated to the runtime's `Intl.PluralRules`.
 * No hand-rolled category list: the locale decides which categories exist and
 * which one a count falls into.
 */

import type {
  Locale,
  PluralCategory,
  PluralTranslation,
  TranslationMap,
  TranslationNode,
} from "./types";

/** Selects the CLDR plural category for a count in a fixed locale. */
export type PluralRuleFn = (count: number,) => PluralCategory;

/**
 * Every CLDR plural category a plural-variant node may be keyed by.
 *
 * SHARED by the server and the browser. This pair of primitives used to be
 * copy-pasted into BOTH `src/i18n/translator.ts` and `src/frontend/i18n.ts`, and
 * the copies silently drifted: the browser kept the constant but stopped
 * selecting variants, so a plural key rendered as its raw key in the browser
 * while the server rendered "1 item" (BUG-ispluralnode-duplicated). This module
 * is a dependency-free leaf, so both tsconfig programs import it directly —
 * keep the discriminator here and there is only one copy to change.
 */
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
 * Requiring ALL keys keeps a plain enumeration containing `other` a normal subtree.
 * @param node
 */
export function isPluralNode(
  node: TranslationNode | TranslationMap,
): node is PluralTranslation {
  if (typeof node !== "object" || node === null) { return false; }
  const keys = Object.keys(node,);
  return keys.length > 0 && keys.every((key,) => PLURAL_CATEGORIES[key] === true);
}

/**
 * Pick the variant for `category` from a plural node.
 * Falls back to `other` when the selected category is absent from the catalog.
 * @param variants
 * @param category
 */
export function selectVariant(
  variants: PluralTranslation,
  category: string,
): string {
  const selected = variants[category as keyof typeof variants];
  if (typeof selected === "string") { return selected; }
  return variants.other;
}

/** Per-locale rule cache — constructing `Intl.PluralRules` is the expensive half. */
const ruleCache = new Map<Locale, Intl.PluralRules>();

/**
 * Build the plural-category selector for a locale.
 * An unusable tag degrades to the runtime default locale's rules.
 * @param locale
 */
export function pluralRuleFor(locale: Locale,): PluralRuleFn {
  const cached = ruleCache.get(locale,);
  if (cached) { return (count: number,) => cached.select(count,); }

  let rules: Intl.PluralRules;
  try {
    rules = new Intl.PluralRules(locale,);
  } catch {
    rules = new Intl.PluralRules(undefined,);
  }

  ruleCache.set(locale, rules,);
  return (count: number,) => rules.select(count,);
}
