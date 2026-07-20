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

| Task | Title | Priority | Status |
| ---- | ----- | -------- | ------ |
| TASK-test-performance-shared-state | Test isolation, parallel ironing | Medium | Not Started |
| TASK-frontend-e2e-improvements-draft | Frontend E2E stabilization (draft) | High | Not Started |

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
