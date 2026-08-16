<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Browser console/page-error assertion

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Small
**Type:** Feature Task / Test Infrastructure
**Tags:** testing, e2e, browser, alpine
**Epic:** epic-testing-qa.md

## Summary

No browser test fails on `pageerror` or `console.error`. Unique/uncaught Alpine errors (see `BUG-alpine-init-hydration`) go entirely unnoticed — `characters-flow.browser.ts` collects console messages but only `console.log`s them. Add a helper that records per-page errors and asserts none occurred by test end.

## Core Features

- `assertNoPageErrors(page, { filter? }): Promise<void>` in `tests/e2e/helpers/htmx-alpine.ts` (or a small fixture util)
  - Wire `page.on('pageerror')` + `page.on('console')` into a per-page error array.
  - Filter benign errors (e.g. known nonce/CSP noise) via an allowlist.
- Call in browser tests after the interesting interaction (or in `afterEach`).

## Acceptance Criteria

- [ ] `assertNoPageErrors` recorded and throws (with the collected messages) when ≥1 filtered error occurred
- [ ] Allowlist mechanism for tolerated noise; documented
- [ ] Invoked in `htmx-alpine.browser.ts` (and ideally all `*.browser.ts`)
- [ ] After `BUG-alpine-init-hydration` fix, suite green

## Files

- `tests/e2e/helpers/htmx-alpine.ts` — `assertNoPageErrors`
- `tests/e2e/flows/browser/*.browser.ts` — invoke
