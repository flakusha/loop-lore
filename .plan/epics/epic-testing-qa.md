# EPIC: Testing & Quality Assurance (Permanently Ongoing)

**Status:** 🟡 Permanently Ongoing
**Priority:** High
**Effort:** Continuous
**Type:** Ongoing Epic

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

| Task                                 | Title                              | Priority | Status      |
| ------------------------------------ | ---------------------------------- | -------- | ----------- |
| TASK-test-performance-shared-state   | Test isolation, parallel ironing   | Medium   | Not Started |
| TASK-frontend-e2e-improvements-draft | Frontend E2E stabilization (draft) | High     | Not Started |

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

## Extended Scope / Candidate Tasks

| Task                       | Title                                                                   | Priority                                          | Status      |
| -------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------- | ----------- |
| TASK-test-dialect-matrix   | Parameterize `createTestDb(DialectFactory)`; CI matrix `DIALECT=sqlite  | pg`(GitHub`services: postgres` or Testcontainers) | High        |
| TASK-test-pg-pitfalls      | Cross-dialect guard tests: JSON, RETURNING, ON CONFLICT, boolean, dates | High                                              | Not Started |
| TASK-test-factories        | Add `src/test-utils/factories.ts` typed builders; migrate e2e setup     | Med                                               | Not Started |
| TASK-test-runtime-coverage | Gate `bun test --coverage` with floor (start 60%) in `check`            | Med                                               | Not Started |
| TASK-test-contract         | Contract suite once OpenAPI exists (`tests/contract/` per route)        | Med                                               | Not Started |
| TASK-test-load             | Smoke load test for `/api/messages` streaming on seeded chat            | Low                                               | Not Started |

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
- Playwright + htmx/Alpine: assert on swapped DOM, `htmx:afterSwap`; SSE via `route.fulfill`; Alpine state via `Alpine.$data(el)` — https://playwright.dev/, https://htmx.org/docs/, https://github.com/cjr47/htmx_alpine_playwright_tutorial
- SQLite↔PG pitfalls: type affinity, JSON (jsonb vs string), RETURNING, ON CONFLICT, boolean (0/1), LIMIT/OFFSET, dates (ISO TEXT vs timestamptz)

## Related Epics

- **Epic Code Quality & Best Practices** — type-coverage + complexity gates in `check` originate from Code Quality tasks; QA consumes those metrics.
- **Epic 27 (Data Integrity & ACID)** — `data_version` optimistic-concurrency needs dedicated concurrency tests (parallel writes → 409 conflict); see Epic 27 Phase 2.
