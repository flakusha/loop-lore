<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Alpine Component-State Testing Harness

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Feature Task / Test Infrastructure
**Tags:** testing, e2e, browser, alpine, playwright
**Epic:** epic-testing-qa.md

## Summary

The browser e2e suite currently asserts DOM **presence** (`state: "attached"`) and **global stores only** (`Alpine.store('ui'/'sidebar')`). It never reads **component-local reactive state** (`chatState()` etc.), so Alpine state bugs — typo'd template variables, missing state defaults, hydration aborts — pass silently. Main point of this task: add a component-state harness and migrate the Alpine browser tests onto it.

## Core Features

- `getAlpineData(page, selector): Promise<Record<string, unknown>>` in `tests/e2e/helpers/htmx-alpine.ts`
  - Read component state via `el.__x.getUnobservedData()` (preferred) or `Alpine.$data(el)`.
  - Return a plain clone safe to assert on (unobserved data keeps functions intact; strip Alpine Proxy).
- `waitForAlpineState(page, selector, predicate, timeoutMs?)` — web-first polling until predicate holds, replacing fixed `page.waitForTimeout(...)` sleeps.
- Mirror of `getAlpineStore` that works on **any** `Alpine.store(name)` and **component** state.

## Acceptance Criteria

- [ ] `getAlpineData` reads full `chatState()` reactive surface (verified: `chats`, `filteredChats`, `activeChat`, `isGenerating`, …) at runtime
- [ ] `waitForAlpineState` retries until state meets predicate; fails with clear timeout error otherwise
- [ ] Migrate `htmx-alpine.browser.ts` + `chat-flow.browser.ts` off `attached`-presence and fixed sleeps onto state assertions where intent is reactivity
- [ ] After BUG-alpine-init-hydration is fixed, `Chat list selection` reasserts a rendered `.nav-item` per seeded chat
- [ ] Full browser suite green: `for f in tests/e2e/flows/browser/*.browser.ts; do bun test --max-concurrency=1 "./$f" || exit 1; done`
- [ ] No new fixed-sleep waits introduced

## Files

- `tests/e2e/helpers/htmx-alpine.ts` — add helpers
- `tests/e2e/flows/browser/htmx-alpine.browser.ts` — migrate
- `tests/e2e/flows/browser/chat-flow.browser.ts` — migrate

## Notes / Verification

- Component-state read via `Alpine.$data(el)` confirmed working in a live Probe: returns keys `isGenerating`, `chats`, `filteredChats`, `activeChat`, `rpgStats`, … (13 pass / 4 fail current baseline; root timeout is BUG-alpine-init-hydration).
- Use Playwright web-first assertions (locator+expect) where applicable; avoid `waitForTimeout`.
