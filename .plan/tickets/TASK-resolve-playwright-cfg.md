<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Resolve dead playwright.config.ts

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Small
**Type:** Feature Task / Test Infrastructure
**Tags:** testing, e2e, playwright, config
**Epic:** epic-testing-qa.md

## Summary

`playwright.config.ts` defines the full Playwright test surface (`testDir`, `projects`, `retries`, `trace`, `reporter`, viewport, action/navigation timeouts) — but browser tests run via **`bun test ./tests/e2e/flows/browser/*.browser.ts`**, which never reads it. Only `chromium.launch()` in `tests/e2e/helpers/browser-server.ts` actually runs. The config is dead/misleading.

Pick one direction and commit:

- **Option A — adopt `@playwright/test` runner:** move `*.browser.ts` to the Playwright test runner (gains web-first `expect` polling, per-test fixtures, auto trace/screenshot/retries, parallel-safe isolation). Requires a `webServer`/fixture that boots the test server via `createBrowserTest`; heavier migration.
- **Option B — delete the dead config:** keep `bun test` + Chromium library, remove `playwright.config.ts`, fold any genuinely-used settings (viewport) into `browser-server.ts`.

## Acceptance Criteria

- [ ] Repo state matches chosen option (no config that the actual runner ignores)
- [ ] Browser suite still runs and is green via the documented command
- [ ] `test:e2e:browser` / CI `test-browser` step updated if command changed

## Files

- `playwright.config.ts`
- `tests/e2e/helpers/browser-server.ts`
- `package.json` (`test:e2e:browser`, `test:e2e:smoke`)
- `.github/workflows/ci.yml` (`test-browser` job)

## Note

Default recommendation: **Option A** long-term (unlocks TASK-alpine-state-testing's web-first polling without hand-rolled helpers); **Option B** if quick cleanup is preferred. Decide with maintainers before big refactor.
