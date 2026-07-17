# E2E Feasibility: htmx + Alpine.js Integration Testing

**Date**: 2026-07-12
**Status**: Feasible — helpers + tests created

## Current State

- **Runner**: `bun:test` with Playwright as library (not `@playwright/test` runner)
- **Server**: `browser-server.ts` serves frontend (static + views + API) on random port
- **Browser**: Playwright `chromium.launch({ headless: true })`, 1280x720
- **Selectors**: `data-testid` exclusively
- **Seed**: `seedAll()` provides deterministic data

## Gaps Identified

## Feasibility

Fully feasible. `browser-server.ts` serves complete frontend stack. Playwright can `page.evaluate` to wait for `htmx:afterSwap`, check `Alpine.store()`, verify event listeners, assert DOM after morph swaps.

## Test Plan

### Helpers

- `waitForHtmxSwap(page, selector)` — resolves on `htmx:afterSwap` for target
- `waitForAlpineInit(page)` — resolves when `Alpine.version` + stores ready
- `navigateViaHtmx(page, testid)` — clicks htmx link, waits for swap + Alpine
- `getAlpineStore(page, storeName)` — returns store state
- `countEventListeners(page, type)` — regression guard

### Test Cases
