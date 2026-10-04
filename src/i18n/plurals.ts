// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plural Rules
 *
 * CLDR plural-category selection delegated to the runtime's `Intl.PluralRules`.
 * No hand-rolled category list: the locale decides which categories exist and
 * which one a count falls into.
 */

import type { Locale, PluralCategory, } from "./types";

/** Selects the CLDR plural category for a count in a fixed locale. */
export type PluralRuleFn = (count: number,) => PluralCategory;

/** Per-locale rule cache — constructing `Intl.PluralRules` is the expensive half. */
const ruleCache = new Map<Locale, Intl.PluralRules>();

/**
 * Build the plural-category selector for a locale.
 * An unusable tag degrades to the runtime default locale's rules.
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
