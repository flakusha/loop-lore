<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Fix cross-file mock.module leaks under non-isolated and coverage-mode test runs

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

Bun's mock.module is process-global and cannot be unmocked. Two related failure classes are pre-existing on dev (reproduced 2026-09-07):

1. Under `bun test --coverage` (~120 failures): mock.module isolation behaves differently under instrumentation; whole suites are suppressed, pushing 23/50 src modules below the 80% per-module coverage floor (scripts/check/coverage.mjs --floor=80). This keeps the 'coverage - per-module line %' check red even though test:coverage now emits lcov correctly (fixed via --coverage-reporter/--coverage-dir flags in package.json).

2. In non-isolated multi-file runs with npm_lifecycle_event set, a file's mock.module of a shared module (e.g. ../providers/call-with-failover, ../cancellation-manager) leaks into later files that import the real module, failing their tests (repro: npm_lifecycle_event=test:unit bun test src/generation/generate-route/non-stream.test.ts src/generation/providers/registry.test.ts — and the cancellation-manager trio: stream-to-client.test.ts, __tests__/abort.test.ts, routes/messages/__tests__/nsfw-flag-before-access.test.ts).

registry.test.ts already carries the pristine-module probe guard pattern (0f141eeb) that can be generalized. Acceptance: 'bun run check' coverage stage green with floor=80; the gate-env non-isolated combo above exits 0. Per user decision 2026-09-07 the floor stays 80 — fix the isolation problem, not the threshold.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
