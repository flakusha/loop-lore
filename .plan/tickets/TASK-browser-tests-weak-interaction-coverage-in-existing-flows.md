<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Browser tests: weak interaction coverage in existing flows

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-testing-qa
**Summary:** Browser test flows in `tests/e2e/flows/browser/` assert DOM presence (`state: "attached"`) but not interaction: no clicks, no state transitions, no side-effect assertions. The epic-testing-qa epic documents this gap explicitly — Alpine hydration failures pass silently because browser tests never assert on page/console errors.
**Context:** Found 2026-08-25 review. Epic testing QA (`epic-testing-qa.md`) explicitly identifies the gap: "Browser test flows assert DOM presence but not interaction." `tests/e2e/flows/browser/htmx-alpine.browser.ts` shows 13 pass / 4 fail / 1 error with undeclared template variables causing Alpine to abort.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Git Issue:** adff874

## What

- `tests/e2e/flows/browser/chat-flow.browser.ts:39-207` — ~12 of 14 tests are attached-in-DOM checks only, zero interaction; header comment defers toggle/visibility tests that never landed for gallery/character-info panels.
- `tests/e2e/flows/browser/auth-flow.browser.ts:88-91` — only wrong-creds validation tested; no successful form-driven login (only demo-link path in `auth-session`).
- `tests/e2e/flows/browser/group-chat-matrix.browser.ts:94-118` — turn-order asserted on cold render only, no advancement/regeneration despite `matrix` name.
- `tests/e2e/flows/browser/settings-flow.browser.ts:71` — theme change asserted via settings JSON only; never asserts theme class applied to html/body.
- `tests/e2e/flows/browser/smoke.browser.ts:191` — locale selector DOM-only.

## Why

Interaction assertions catch Alpine hydration failures that silently pass as DOM-presence tests. Without them, template expression bugs (`showGmPanel is not defined`, `_searchResults is not defined`) surface only in manual browser testing.

## Scope

- Add one interaction assertion per flow: a click, a state transition, or a side-effect assertion that exercises the actual component behavior.
- Add `assertNoPageErrors` (or equivalent) as a guard assertion at the top of each browser test to fail on console errors / pageerrors.
- Out of scope: rewriting all DOM-presence checks (keep them, layer interactions on top).

## Acceptance Criteria

- [ ] Each of the 5 named flows has at least one interaction assertion added
- [ ] A console-error/pageerror guard assertion is added to each browser test
- [ ] `bun test tests/e2e/flows/browser/` green (or known-fail list updated)
