<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: idempotency in-flight slot orphaned by throwing handler → permanent 409

**Status:** ✅ Resolved (fixed in worktree merge-review-followups, 2026-08-27)
**Priority:** high
**Effort:** Small
**Epic:** epic-middleware-request-lifecycle

## Summary

In `src/middleware/idempotency.ts`, an in-flight request occupies a memory
slot that is only released when the entry is later marked `complete`
(TTL-evicted). If the handler **throws**, the slot is never released, so every
subsequent request with the same `(method, route, requestId)` returns **409
forever** until process restart. `recordResponse` only clears completed
entries.

## Acceptance Criteria

- [ ] Release the in-flight slot on the handler throw / error path.
- [ ] Test: throwing handler → next same-key request is allowed to re-run (not
      a perpetual 409).
