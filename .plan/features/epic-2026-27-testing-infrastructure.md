# Epic 2026-27: Testing Infrastructure

**Status:** In Progress (P1)
**Priority:** High
**Source:** docs/meta/open-items.md, .plan/tickets/TASK-e2e-test-improvements.md

## Summary

Comprehensive testing infrastructure for unit, E2E, and browser tests.

## Linked Tasks

| Task | Title | Priority | Status |
| ---- | ----- | -------- | ------ |
| TASK-2026-004 | E2E: no cancel-during-generation test | Medium | Not Started |
| TASK-2026-005 | E2E: no generation idempotency test | Medium | Not Started |
| TASK-2026-006 | E2E: test ordering fragile (shared mutable state) | Medium | Not Started |
| TASK-2026-007 | E2E: browser auth flow incomplete | Medium | Not Started |
| TASK-2026-008 | E2E: browser chat flow sends no messages | Medium | Not Started |
| TASK-2026-009 | Unit: 17 quick-win source files untested | Medium | Not Started |
| TASK-2026-010 | Unit: story module nearly untested | Medium | Not Started |
| TASK-2026-011 | Unit: route handler isolation missing | Low | Not Started |
| TASK-2026-012 | E2E: RPG mechanics no tests | Low | Not Started |
| TASK-test-performance-shared-state.md | E2E test performance improvements | Medium | Not Started |
| TASK-frontend-e2e-improvements-draft.md | Frontend E2E improvements | Medium | Not Started |
| TASK-e2e-test-improvements.md | E2E test coverage improvements | Medium | In Progress |

## Implementation Plan

### Phase 1: E2E Stability
- [ ] Fix parallel suite instability (per-request singleton)
- [ ] Fix cascade failure pattern (fresh state per test)
- [ ] Add cancel-during-generation test
- [ ] Add generation idempotency test

### Phase 2: Browser E2E
- [ ] Complete auth flow tests (login, logout, demo)
- [ ] Complete chat flow tests (typing, send, receive)
- [ ] Fix data-testid mismatches

### Phase 3: Unit Coverage
- [ ] Add tests for low-coverage routes (worlds, story-items, messages, quests, story-states)
- [ ] Add tests for story module (quest-engine, quality-evaluator, turn-manager)
- [ ] Add route handler isolation

### Phase 4: Performance Testing
- [ ] E2E performance benchmarks
- [ ] Browser testing with Playwright responsive tests

## Files

- `tests/e2e/helpers/server.ts` — Test server setup
- `tests/e2e/flows/browser/` — Browser tests
- `tests/e2e/flows/generation.test.ts` — Generation tests
- `src/story/*.test.ts` — Story module tests (to create)
- `src/routes/*.test.ts` — Route unit tests
