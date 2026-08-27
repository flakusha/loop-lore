<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: `asyncStore.fail()` error boundary is dead code

**Status:** 🔧 In Progress (found in 2026-08-27 review; epic reopened)
**Priority:** high
**Effort:** Small
**Epic:** epic-middleware-request-lifecycle

## Summary

`src/elysia-app.ts` registers two `.onError(...)` handlers: the validation
error handler first, then the async-store `fail()` handler. The validation
handler always returns a value (a formatted error response). Elysia's dynamic
error handler short-circuits on the **first** non-null return, so the
`asyncStore.fail()` handler (which marks the `request_results` row `failed`)
**never runs**. Result: uncaught/thrown handler errors leave the async-store
row stuck on `pending` forever — the exact failure the epic's AC claimed was
fixed.

## Acceptance Criteria

- [ ] Ensure exactly one error handler, OR order so `asyncStore.fail()` runs
      before any handler that returns (or have the validation handler itself
      call `asyncStore.fail()`).
- [ ] Integration test: handler throws → row transitions to `failed` with
      `error` populated, not stuck `pending`.
