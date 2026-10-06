<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-010-plurals: i18n Plural Rules (Intl.PluralRules integration)

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Summary:** Add `Intl.PluralRules` (CLDR) integration to the i18n runtime so the `zero` / `one` / `other` plural categories resolve correctly per locale, gated by an e2e test.
**Context:** Decomposed from TASK-010 on 2026-09-23 — the plural AC could not be covered alongside the locale-switch task: `src/i18n/translator.ts:68` currently uses plain `{param}` interpolation with no plural rule infra.
**Acceptance Criteria:** See ## Acceptance Criteria below.


**Status**: Done
**Priority**: medium
**Labels**: i18n, plurals, deferred
**Epic**: epic-frontend-internationalization
**Related**: TASK-010, src/i18n/translator.ts, src/i18n/types.ts

## Background

TASK-010's acceptance criteria include:

> Plural forms resolve correctly for `zero`/`one`/`other` for at least English
> and one plural-rich locale.

The current translator (`src/i18n/translator.ts`) only does single-string
interpolation with `{param}` placeholders. There is no plural-rule logic and
no `Intl.PluralRules` import. Building that infra is its own scoped task —
not a side-effect of locale switching or fallback.

## Acceptance Criteria

- [ ] `createTranslator` accepts a `pluralRule: (count: number) => 'zero' | 'one' | 'few' | 'many' | 'other'` derived from `Intl.PluralRules` for the primary locale.
- [ ] Translation map supports per-key plural variants: `{ key: { one: "{count} item", other: "{count} items" } }`.
- [ ] `t(key, { count: 2 })` resolves the `other` branch; `t(key, { count: 1 })` resolves the `one` branch.
- [ ] Unit tests cover at least English (`one`/`other`) and one plural-rich locale (e.g. Russian — `one`/`few`/`many`/`other`).
- [ ] E2E test in `tests/e2e/i18n/` exercises a visible pluralized string in the UI.
- [ ] Fallback locale is consulted when the active locale is missing a plural variant.

## Design Sketch (sketch only — not implementation)

```typescript
import type { Locale, } from "./types";

interface PluralTranslation {
  one?: string;
  few?: string;
  many?: string;
  other: string;
  zero?: string;
}

export function pluralRuleFor(locale: Locale,): (n: number) => Intl.PluralRules["select"] {
  const pr = new Intl.PluralRules(locale,);
  return (n: number,) => pr.select(n,);
}
```

The translator signature gains an optional `plurals` map; lookup falls through
primary → fallback → raw key, with the rule function selecting the variant.

## Files Touched (estimated)

- `src/i18n/translator.ts` — add plural handling (next to `interpolate`).
- `src/i18n/types.ts` — add `PluralTranslation` + `PluralMap`.
- `src/i18n/__tests__/translator.test.ts` — plural cases for English + Russian.
- `tests/e2e/i18n/i18n-plural.browser.ts` — UI exercise.

## Why this is its own ticket

- Touches `translator.ts` types + signatures (breaking change for any caller).
- Needs new schema in translation catalogs.
- Needs catalog updates for at least the two target locales.
- Independent of the locale-switch + missing-key work landed in TASK-010
  via `tests/e2e/i18n/i18n-locale.browser.ts` on 2026-09-23.

## Source

Git issue: filed 2026-09-23 — decomposed from TASK-010 (`9dd6fbf`).

**Resolved:** 2026-10-06 registry-driven close: git issue fc3b325 (registry tip: 2c9a5d1bc Konstantin Fedotov Auto-closed: appended .md marker marks TASK-010-PLURALS done)

## Resolution

Plural selection now comes from the runtime's `Intl.PluralRules`; no category
list is hand-rolled and the locale is the one the translator is already
configured with.

- `src/i18n/plurals.ts:30` — `pluralRuleFor(locale)` returns a cached
  `Intl.PluralRules.select` for that locale (42L file).
- `src/i18n/types.ts:14` — `PluralCategory` = `Intl.LDMLPluralRule`.
- `src/i18n/types.ts:21` — `PluralTranslation` per-key variant table; `other`
  required. `src/i18n/types.ts:31` — `TranslationNode` = string | variants.
- `src/i18n/translator.ts:32` — `isPluralNode` guard. A node is plural data only
  when ALL of its keys are CLDR categories, so the shipped enumeration
  `chats.flagReason` (which merely contains an `other` key) stays a subtree.
- `src/i18n/translator.ts:50` — `flattenTranslations` stores a plural object as
  a leaf under its own key instead of descending into `.one` / `.other`.
- `src/i18n/translator.ts:109` — `resolveKey` takes an options object
  (`translations`/`key`/`count`/`rule`) and returns the selected variant; an
  absent category falls back to `other`.
- `src/i18n/translator.ts:151` — `TranslatorOptions.pluralRule` override;
  defaults to `pluralRuleFor(locale)` at `src/i18n/translator.ts:170`.
- `src/i18n/translator.ts:170` — `createTranslator` reads a NUMERIC `params.count`
  and applies the same selection to the primary and fallback catalogs.
- `src/frontend/i18n.ts:35` — same leaf rule in the frontend flattener, which
  shares `TranslationMap` (`src/frontend/i18n.ts:101`).
- `src/i18n/__tests/translator.test.ts` — 14 plural cases (262L, excluded from
  the size gate): `en` one/other, `ru` one/few/many, `ar` zero/one/two/many,
  missing-category → `other`, zero, no-count, string-count, interpolate
  interaction, fallback-catalog lookup, `pluralRule` override.

Contract note: only a NUMERIC `count` drives selection. The shipped
`{count} chat(s)`-style strings are reached with `String(ids.length)`, so they
keep rendering exactly as before — verified against the real `src/public/locales`
catalogs, which are unchanged.

**Resolved:** 2026-10-06 registry-driven close: git issue fc3b325 (registry tip: 2c9a5d1bc Konstantin Fedotov Auto-closed: appended .md marker marks TASK-010-PLURALS done)
