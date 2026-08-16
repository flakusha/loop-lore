<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Alpine state contract tests (chatState + ui-store)

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Small
**Type:** Feature Task / Test Infrastructure
**Tags:** testing, e2e, browser, alpine, contract
**Epic:** epic-testing-qa.md

## Summary

Pin the Alpine component/store shape and defaults so additions and typos fail loudly — the `showGmPanel`/`_moodPanel`/`_searchResults` ReferenceErrors in `BUG-alpine-init-hydration` are undeclared-template-var bugs a contract test would have caught. Requires `getAlpineData` from `TASK-alpine-state-testing`.

## Core Features

- Browser test asserting the full `chatState()` surface: every declared property + default value (from `src/frontend/alpine/chat.ts` return object).
- Browser test asserting `ui-store` (`$store.ui.*`) defaults + that each is declared (mirror `src/frontend/stores/ui-store.ts`).
- Guard: any template reference to a state key not present in `chatState()`/`ui` fails the test.

## Acceptance Criteria

- [ ] `chatState()` default-shape test passes against current source
- [ ] `ui` store default-shape test passes
- [ ] Introduces (or documents) a template→state key consistency check for the chat subtree

## Files

- `tests/e2e/flows/browser/chat-state.browser.ts` (new)
- Uses `tests/e2e/helpers/htmx-alpine.ts` (`getAlpineData`, `getAlpineStore`)
