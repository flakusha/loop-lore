# TASK: Browser test isolation (failure cascade)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Small
**Type:** Feature Task / Test Infrastructure
**Tags:** testing, e2e, browser, reliability
**Epic:** epic-testing-qa.md

## Summary

A timed-out test leaves its page open; the next `newPage()` raises `Target page, context or browser has been closed` / `Protocol error (Target.createTarget): Not supported`, cascading ~3 extra failures off a single root timeout. Browser tests share one `BrowserTestContext` (`browser: BrowserContext`) and don't guarantee page cleanup on failure.

## Core Features

- Ensure every test closes its page in `finally` (or a beforeEach/afterEach fixture that closes outstanding pages).
- On failure of any test, close all open pages so the shared context is clean for the next test.
- Keep one browser/context per file (cheap) but zero page leakage between tests.

## Acceptance Criteria

- [ ] A single failing test no longer causes subsequent `newPage` "browser closed" errors
- [ ] All `*.browser.ts` tests wrap cleanup in `try/finally` or use a close-all fixture
- [ ] Failure output names the real root cause, not a cascade

## Files

- `tests/e2e/flows/browser/*.browser.ts`
- `tests/e2e/helpers/browser-server.ts` (`BrowserTestContext` — add a `newPage`/cleanup helper if useful)
