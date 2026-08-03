# EPIC: Testing & Quality Assurance (Permanently Ongoing)

**Status:** 🟡 Permanently Ongoing
**Priority:** High
**Effort:** Continuous
**Type:** Ongoing Epic
**Tags:** testing, quality-assurance, unit-tests, e2e, coverage

## Summary

Debugging, unit tests, e2e tests, browser tests, and test infrastructure improvements. Continuously improve test coverage, reliability, and speed.

## Scope

- Unit test coverage improvements
- E2E test stabilization
- Browser test improvements
- Test performance optimization
- Debug tooling improvements
- Test infrastructure (fixtures, mocks, helpers)

## Linked Tasks

| Task                                 | Title                                                       | Priority | Status      |
| ------------------------------------ | ----------------------------------------------------------- | -------- | ----------- |
| TASK-2026-013                        | Nested ternary expressions from dprint reformatting         | High     | Not Started |
| TASK-2026-014                        | Backend lint errors from new notification files             | High     | Not Started |
| TASK-2026-015                        | Fix DB migration test failures (missing down + schema sync) | High     | Not Started |
| TASK-2026-016                        | Fix crypto test isolation (138 pass isolated, ~20 in suite) | High     | Not Started |
| TASK-2026-021                        | Fix generation test failures (mock provider + streaming)    | High     | Not Started |
| TASK-2026-008                        | E2E: browser chat flow sends no messages                    | High     | Not Started |
| TASK-2026-017                        | Add unit tests — untested modules batch (7 modules)         | Medium   | Not Started |
| TASK-2026-009                        | Unit: 17 quick-win source files untested                    | Medium   | Not Started |
| TASK-2026-010                        | Unit: story module nearly untested                          | Medium   | Not Started |
| TASK-2026-018                        | Expand coverage — assistant module (42 src / 3 tests)       | Medium   | Not Started |
| TASK-2026-019                        | Expand coverage — config module (24 src / 2 tests)          | Medium   | Not Started |
| TASK-2026-020                        | Expand coverage — transport + group-chat modules            | Medium   | Not Started |
| TASK-2026-006                        | E2E: test ordering fragile (shared mutable state)           | Medium   | Not Started |
| TASK-2026-011                        | Unit: route handler isolation missing                       | Medium   | Not Started |
| TASK-frontend-e2e-improvements-draft | Frontend E2E stabilization (draft)                          | High     | Not Started |

## Metrics

- Unit test coverage: track and improve
- E2E test reliability: 100% pass rate target
- Test execution time: minimize
- Flaky tests: 0 target

## Files

- `src/**/*.test.ts` — unit tests
- `tests/e2e/` — E2E tests
- `tests/e2e/flows/browser/` — browser tests
- `src/test-utils/` — test utilities

## Analysis & Current State (2026-07)

Grounded against `docs/meta/code-practices-improvements/05-testing-e2e-multiple-db.md` and `tests/e2e/helpers/server.ts`.

**Strengths already in place:**

- E2E safeguard (`enforceE2eSafeguard`): refuses run unless `:memory:` DB, `/tmp/` uploads, auth off — strong safety net.
- In-memory test DB + `setTestDatabase()` override; mock LLM provider via `registerProvider`.
- Multi-layer `check` gates: typecheck + type-coverage(85%) + lint + css/html lint + format + md lint.
- Playwright browser e2e under `tests/e2e/flows/browser/`.

**Gaps (from 05, NOT done):**

- **Only SQLite tested** — Kysely dialect-swap (Postgres) never exercised; PG-specific migration/query quirks ship untested.
- No `DialectFactory` abstraction — `createTestDb()` hardcodes `bun:sqlite`.
- No API **contract tests** (no OpenAPI spec yet — see AGENTS.md Zod/TypeBox trap; current stack is Elysia `t`).
- No **runtime** coverage threshold (only type-coverage gated).
- No test-data **factories** (`makeChat()`/`makeMessage()`) — inline literals drift.
- No performance/load tests for streaming / large-chat pagination.

## Alpine.js State Testing & Browser E2E Health (2026-08)

Fresh finding from live browser review (`tests/e2e/flows/browser/htmx-alpine.browser.ts`, rebuilt frontend). The browser suite mostly asserts DOM **presence** (`state: "attached"`) and **global stores** only (`Alpine.store('ui'/'sidebar')`) — it never reads **component-local reactive state** (`chatState()` etc.) and never asserts on **page/console errors**, so real Alpine hydration failures pass silently.

**Verified current state (htmx-alpine.browser.ts):** 13 pass / 4 fail / 1 error. Root failure: `Chat list selection > … .nav-item` times out — the `x-if`/`x-for` in `#chat-list` **never hydrates** even though `chats`/`filteredChats` are correctly populated (`chats=1`, `filteredChats=1`, but `#chat-list` still raw `<template>`). Live console shows Alpine aborts subtree processing on uncaught errors:

```text
TypeError: Object.defineProperty called on non-object   (x12+)
TypeError: o.get is not a function
ReferenceError: showGmPanel is not defined
ReferenceError: _searchResults is not defined
ReferenceError: _moodPanel is not defined
```

These are **app bugs**, not test bugs: template expressions reference variables never declared in component state, which throws during Alpine tree-processing and halts hydration of that branch. No browser test catches them (characters-flow logs console messages but never fails).

**Other structural gaps:**

- `playwright.config.ts` is **dead config** — `bun test` (the actual runner) never reads it; only `chromium.launch()` in `browser-server.ts` runs. `testDir`/`projects`/`retries`/`trace`/`reporter` document behavior the tests don't use.
- Hundreds of fixed `page.waitForTimeout(...)` sleeps instead of web-first polling; flaky (esp. Alpine timing — `attached` vs `visible` tension documented in `chat-flow.browser.ts`).
- A timed-out test leaves its page open, then `newPage()` fails with `Target page, context or browser has been closed` — no per-test `try/finally` isolation → failure cascade.

### Alpine State Testing — Candidate Tasks

| Task                        | Title                                                                                                                                          | Priority | Status      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| TASK-alpine-state-testing   | Alpine component-state harness: `getAlpineData` + `waitForAlpineState` helpers, migrate htmx-alpine/chat-flow off presence+sleeps              | High     | Not Started |
| BUG-alpine-init-hydration   | Fix Alpine init hydration errors (undeclared template vars `showGmPanel`/`_moodPanel`/`_searchResults`; `Object.defineProperty on non-object`) | High     | Not Started |
| TASK-browser-console-assert | Add `assertNoPageErrors` helper; fail browser tests on pageerror/console.error                                                                 | High     | Not Started |
| TASK-browser-test-isolation | Per-test `try/finally` page close; eliminate failure cascade / shared browser state                                                            | Med      | Not Started |
| TASK-resolve-playwright-cfg | Adopt `@playwright/test` runner (web-first expect, fixtures, trace) or delete dead `playwright.config.ts`                                      | Med      | Not Started |
| TASK-chat-state-contract    | Pin `chatState()` shape + defaults + `ui-store` contract as a browser test                                                                     | Low      | Not Started |

## Extended Scope / Candidate Tasks

| Task                       | Title                                                                   | Priority | Status      |
| -------------------------- | ----------------------------------------------------------------------- | -------- | ----------- |
| TASK-test-dialect-matrix   | Parameterize `createTestDb(DialectFactory)`; CI matrix sqlite/pg        | High     | Not Started |
| TASK-test-pg-pitfalls      | Cross-dialect guard tests: JSON, RETURNING, ON CONFLICT, boolean, dates | High     | Not Started |
| TASK-test-factories        | Add `src/test-utils/factories.ts` typed builders; migrate e2e setup     | Med      | Not Started |
| TASK-test-runtime-coverage | Gate `bun test --coverage` with floor (start 60%) in `check`            | Med      | Not Started |
| TASK-test-contract         | Contract suite once OpenAPI exists (`tests/contract/` per route)        | Med      | Not Started |
| TASK-test-load             | Smoke load test for `/api/messages` streaming on seeded chat            | Low      | Not Started |

## Open Questions

1. PG in CI: use GitHub `services: postgres:16` (already dockerized) or Testcontainers for local parity? Recommend services in CI, Testcontainers local.
2. Should contract tests be generated from an OpenAPI spec, or hand-written against `t` (TypeBox) schemas directly? (Note: Zod migration in `06` is aspirational — current stack is Elysia `t`.)
3. Runtime coverage floor: 60% start, or jump to match type-coverage (85%)?
4. Should `data_version` optimistic-concurrency (epic 27) get dedicated concurrency tests (parallel writes → conflict)? Yes — link to epic 27.

## Research / References

- `docs/meta/code-practices-improvements/05-testing-e2e-multiple-db.md` — full gap analysis
- Testcontainers Node (`@testcontainers/postgresql`): https://testcontainers.com/
- Kysely PostgresDialect; `pg-mem` for fast unit-level PG: https://github.com/kysely-org/kysely/issues/801
- Bun test + coverage: https://bun.sh/docs/cli/test
- Playwright + htmx/Alpine: assert on swapped DOM, `htmx:afterSwap`; SSE via `route.fulfill`; Alpine state via `Alpine.$data(el)` / `el.__x.getUnobservedData()` — https://playwright.dev/, https://htmx.org/docs/, https://github.com/cjr47/htmx_alpine_playwright_tutorial
- Component state reads: `Alpine.$data(el)` verified working for `chatState()` in browser probe (returns full reactive surface); prefer `__x.getUnobservedData()` for unobserved/function-intact reads.
- SQLite↔PG pitfalls: type affinity, JSON (jsonb vs string), RETURNING, ON CONFLICT, boolean (0/1), LIMIT/OFFSET, dates (ISO TEXT vs timestamptz)

## Related Epics

- **Epic Code Quality & Best Practices** — type-coverage + complexity gates in `check` originate from Code Quality tasks; QA consumes those metrics.
- **Epic 27 (Data Integrity & ACID)** — `data_version` optimistic-concurrency needs dedicated concurrency tests (parallel writes → 409 conflict); see Epic 27 Phase 2.
