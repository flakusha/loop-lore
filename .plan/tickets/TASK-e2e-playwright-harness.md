<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-e2e-playwright-harness: Browser e2e harness hardening

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Test Infrastructure
**Tags:** testing, e2e, browser, playwright
**Epic:** epic-testing-qa
**Parent:** TASK-BROWSER-E2E-COVERAGE-EXPANSION-PLAYWRIGHT-INTEGRATION (umbrella)

## Summary

Harden the browser e2e harness before any new coverage lands: fail on console/page errors, isolate pages per test, provide web-first Alpine state helpers, and retire dead/fixed-wait patterns. Prerequisite for every sibling child ticket.

## Context

Structural gaps present in **all 7** existing `*.browser.ts` suites (`tests/e2e/flows/browser/`):

1. **No end-to-end data mutation through the UI.** Chat messages are never sent; files never uploaded; characters/worlds are created via modal but the persisted result is never asserted. Every suite stops at presence/visibility.
2. **No console/pageerror assertion.** One soft (non-failing) console listener in `characters-flow`; `pageerror` never wired. Alpine hydration errors (see `BUG-alpine-init-hydration`) pass silently.
3. **Sleep-based waits dominate** (`page.waitForTimeout(1500)` in auth-flow; 100ms fixed sleep in `navigateViaHtmx`); almost no web-first polling.
4. **No per-test page cleanup** — timed-out test leaves its page open → `Target page, context or browser has been closed` cascade (`TASK-browser-test-isolation`).
5. **Component-local Alpine state never read** — only `Alpine.store('ui'/'sidebar')` globals; `chatState()` etc. unasserted (`TASK-alpine-state-testing`).
6. **`playwright.config.ts` is dead config** — runner is `bun test`, never reads it (`TASK-resolve-playwright-cfg`).

## Current Baseline (this worktree, `bdea77f8`, 2026-08-06 run)

Per-file results (full suite, `E2E_SAFEGUARD=1 bun test --max-concurrency=1` per file):

| Suite                        | Pass   | Fail  | Error | Notes                                                                  |
| ---------------------------- | ------ | ----- | ----- | ---------------------------------------------------------------------- |
| `auth-flow.browser.ts`       | 3      | 1     | 1     | Auth redirect loop (tracked in TASK-e2e-auth-flows)                    |
| `characters-flow.browser.ts` | 10     | 0     | 0     | Soft-logs a 404 console error (non-failing)                            |
| `chat-flow.browser.ts`       | 12     | 0     | 0     | Presence only — no send                                                |
| `htmx-alpine.browser.ts`     | 17     | 0     | 0     | Epic's "13 pass / 4 fail" is stale; hydration bug appears fixed on dev |
| `navigation.browser.ts`      | 13     | 0     | 0     |                                                                        |
| `smoke.browser.ts`           | 19     | 0     | 0     |                                                                        |
| `worlds-flow.browser.ts`     | 7      | 0     | 0     |                                                                        |
| **Total**                    | **81** | **1** | **1** |                                                                        |

## Tasks

- [ ] `assertNoPageErrors(page)` helper — fail on `pageerror`/`console.error` with allowlist; invoke in all suites. _(TASK-browser-console-assert)_
- [ ] Per-test `try/finally` page close; close-all-pages on failure. _(TASK-browser-test-isolation)_
- [ ] `getAlpineData` + `waitForAlpineState` helpers; migrate htmx-alpine/chat-flow off fixed sleeps. _(TASK-alpine-state-testing)_
- [ ] Wire persistent console/pageerror capture into the shared server/page bootstrap so every suite inherits it (no per-suite listeners).
- [ ] Migrate remaining suites off sleep-based waits onto web-first polling (`waitForSelector`/`waitForFunction`).
- [ ] Resolve or remove dead `playwright.config.ts` (runner is `bun test`, never reads it). _(TASK-resolve-playwright-cfg)_

## Files

- `tests/e2e/helpers/htmx-alpine.ts` — `assertNoPageErrors`, `getAlpineData`, `waitForAlpineState`
- `tests/e2e/helpers/browser-server.ts` — page cleanup, console wiring
- `tests/e2e/flows/browser/*.browser.ts` — helper adoption, wait migration
- `playwright.config.ts` — resolve or delete

## Dependencies

- Parent hub: `TASK-BROWSER-E2E-COVERAGE-EXPANSION-PLAYWRIGHT-INTEGRATION.md` — **execute first**, all siblings build on these helpers.
- `BUG-alpine-init-hydration` — verify hydration fix holds once `pageerror` assertion lands.
- Siblings: TASK-e2e-auth-flows, TASK-e2e-view-expansion, TASK-e2e-state-contracts consume these helpers.

## Acceptance Criteria

- [ ] A deliberately thrown `console.error` fails the owning test
- [ ] A timed-out test does not cascade `Target page … closed` failures into later tests
- [ ] No `waitForTimeout` remains in migrated suites
- [ ] Existing 82-case baseline still passes with helpers wired
