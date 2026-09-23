<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-010: E2E tests for i18n system

**Status:** 🟡 Partial — locale-switch + missing-key e2e shipped (`tests/e2e/flows/browser/i18n-locale.browser.ts` 2026-09-23; missing-key test asserts SHIPPED behavior: raw key, no client-side fallback chain); plural AC blocked on `Intl.PluralRules` infra, decomposed to TASK-010-plurals
**Priority:** medium
**Effort:** Medium
**Summary:** E2E coverage for the i18n runtime — locale switch, fallback, plurals, interpolation.
**Context:** Browser-level Playwright suite on top of the existing unit tests; gates i18n merges.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: medium
**Effort**: Medium
**Labels**: i18n, e2e, testing
**Assignee**:
**Epic**: epic-frontend-internationalization
**Related**: TASK-010-plurals (decomposed — plural AC deferred; `src/i18n/translator.ts` lacks `Intl.PluralRules` infra)

## Summary

Cover the i18n runtime end-to-end: locale switching, message resolution, pluralization, and interpolation across primary user flows.

## Context

Unit tests already cover the i18n module APIs; this ticket adds browser-level coverage. Scope is the public i18n surface used by chat, persona selector, and gallery views. IN scope: locale switcher, fallback chain, plural rules, interpolation in live views. OUT of scope: backend translation pipelines, ICU MessageFormat syntax extensions beyond what the runtime already supports.

## Acceptance Criteria

- Switching locale updates visible strings in chat, persona selector, and gallery without reload
- DESIRED, NOT MET client-side: missing-key fallback to the configured fallback locale. Shipped frontend translators return the RAW key for missing keys (src/frontend/ui.ts `t`; src/frontend/alpine/i18n.ts `__` → `fallback ?? key`); a fallback chain exists only server-side (src/middleware/i18n.ts `createI18nContext`). A client-side fallback chain is future work — the shipped e2e asserts the actual raw-key behavior
- Plural forms resolve correctly for `zero`/`one`/`other` for at least English and one plural-rich locale
- Interpolation placeholders (`{{name}}`) substitute runtime values and are escaped against XSS
- Test suite runs in CI and gates merges to the i18n epic

## Related Files

- tests/e2e/flows/browser/i18n-locale.browser.ts
- src/i18n/
- docs/frontend/internationalization.md

## Notes

- Coordinate with epic-i18n owners for canonical locale list
- Keep tests locale-agnostic where possible; use data-driven fixtures for plural cases

Git issue: `9dd6fbf`
