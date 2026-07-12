# E2E Feasibility: htmx + Alpine.js Integration Testing

**Date**: 2026-07-12
**Scope**: Browser E2E infrastructure, test patterns, coverage gaps
**Status**: Feasible — helpers + tests created

## Current State

### Infrastructure

- **Runner**: `bun:test` with Playwright as library (not `@playwright/test` runner)
- **Server**: `browser-server.ts` serves full frontend (static + views + API) on random port
- **Browser**: Playwright `chromium.launch({ headless: true })`, 1280x720 viewport
- **Selectors**: `data-testid` exclusively — good discipline
- **Seed**: `seedAll()` provides deterministic users, characters, chats, messages

### Gaps Identified

1. **No htmx event waiting** — tests use `waitForTimeout(400-1500ms)` instead of listening for `htmx:afterSwap`
2. **No Alpine init waiting** — no verification that Alpine components are ready before interaction
3. **No `hx-trigger="load"` verification** — auto-loading content not checked
4. **No htmx error state testing** — error responses not verified in DOM
5. **No morph state preservation testing** — Alpine state after htmx navigation not tested
6. **No event listener cleanup testing** — the bugs we just fixed have no regression coverage
7. **No toast dedup testing** — double-toast bug had no detection

## Feasibility Assessment

**Verdict: Fully feasible.** The existing `browser-server.ts` serves the complete frontend stack (htmx, Alpine, morph extension). Playwright can evaluate JS in-page to:

- Wait for `htmx:afterSwap` events via `page.evaluate(() => new Promise(...))`
- Check `Alpine.store()` state via `page.evaluate(() => Alpine.store('ui'))`
- Verify event listener counts via `page.evaluate(() => getEventListeners(...))`
- Assert DOM state after morph swaps

### Approach

1. Create shared helpers (`tests/e2e/helpers/htmx-alpine.ts`) for common patterns
2. Write focused test file (`tests/e2e/flows/browser/htmx-alpine.browser.ts`)
3. Cover the 7 fixes from Round 4 as regression tests

## Test Plan

### Helper Functions

- `waitForHtmxSwap(page, selector)` — resolves on `htmx:afterSwap` for target
- `waitForAlpineInit(page)` — resolves when `Alpine.version` is available + stores ready
- `navigateViaHtmx(page, testid)` — clicks htmx link, waits for swap + Alpine
- `getAlpineStore(page, storeName)` — returns store state via `page.evaluate`
- `countEventListeners(page, type)` — counts document listeners for a type (regression guard)

### Test Cases

1. **htmx swap triggers Alpine init** — navigate via htmx, verify Alpine components in swapped content are initialized
2. **Morph swap preserves Alpine state** — navigate away from chat and back, verify `$store.ui` resets cleanly
3. **Panel toggle + Escape cleanup** — toggle panels, press Escape, verify panels close and no duplicate handlers
4. **htmx modal load + Alpine interaction** — characters page loads create-modal via htmx, Alpine directives work
5. **Toast appears exactly once** — trigger `show-toast` event, verify single DOM toast
6. **Keydown listener not duplicated** — navigate to chat twice, verify single Escape handler
7. **Notifications handler cleanup** — start/stop NotificationsManager, verify no leaked listeners
