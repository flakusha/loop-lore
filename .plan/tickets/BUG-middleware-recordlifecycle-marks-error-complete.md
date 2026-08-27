<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: `recordLifecycle` marks 4xx/5xx responses `complete`

**Status:** ✅ Resolved (fixed in worktree merge-review-followups, 2026-08-27)
**Priority:** medium
**Effort:** Small
**Epic:** epic-middleware-request-lifecycle

## Summary

`src/middleware/lifecycle.ts` `recordLifecycle` afterHandle calls
`asyncStore.complete(...)` for **any** Response with no 2xx/3xx gate. The AC in
`TASK-async-store-complete-fail-lifecycle-hooks.md` requires 4xx/5xx →
`fail()`. As shipped, failed requests are recorded as `complete`, so the
status endpoint lies about failure and the idempotency `table` backend would
replay a failed response.

## Acceptance Criteria

- [ ] Gate `asyncStore.complete` on success status; call `asyncStore.fail`
      for 4xx/5xx.
- [ ] Test: 500 response → row `failed`, not `complete`.
