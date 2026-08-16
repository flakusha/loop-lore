<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Test Performance — Shared State Ironing

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Med

## Summary

Test suite already runs in parallel and passes. This task iron out shared state issues to improve reliability and speed.

## Current State

- `--isolate` flag added to prevent cross-file pollution
- 1374 unit tests pass, 146/158 e2e pass (92.4%)
- Some tests share mutable singletons (provider registry, stream buffer, plugin registry)

## Known Shared State Issues

| Area                | Problem                              | Impact                     |
| ------------------- | ------------------------------------ | -------------------------- |
| Provider registry   | Singleton shared across test files   | Flaky provider tests       |
| Stream buffer store | Global state leaks between tests     | Intermittent failures      |
| Plugin registry     | Shared plugin instances              | Test interference          |
| DB connections      | Multiple test files open connections | Connection pool exhaustion |
| E2E browser         | `cachedSoloUser` singleton           | Parallel suite corruption  |

## Tasks

### Unit Tests

- [ ] Audit all test files for shared mutable state
- [ ] Replace singletons with fresh instances per test (factory pattern)
- [ ] Use `beforeEach` to reset state instead of relying on isolation
- [ ] Mock external dependencies (file system, network) consistently
- [ ] Add test isolation assertions (verify clean state)

### E2E Tests

- [ ] Replace `cachedSoloUser` with per-request fixture
- [ ] Add `beforeEach` for fresh test data in all e2e files
- [ ] Ensure each test operates on independent starting state
- [ ] Add cleanup hooks for test artifacts

### Performance

- [ ] Benchmark current test suite execution time
- [ ] Identify slowest test files
- [ ] Optimize parallel execution configuration
- [ ] Consider test sharding for large suites

## Success Criteria

- [ ] All tests pass with `--isolate` removed (pure parallelism)
- [ ] No shared mutable state between test files
- [ ] E2E suite runs in < 5 minutes
- [ ] Unit suite runs in < 2 minutes

## Files to Audit

- `tests/e2e/flows/*.test.ts` — all e2e test files
- `src/**/*.test.ts` — all unit test files
- `tests/e2e/helpers/` — shared test utilities

## Risk

Medium — requires careful refactoring of test infrastructure. Changes may reveal hidden dependencies.
