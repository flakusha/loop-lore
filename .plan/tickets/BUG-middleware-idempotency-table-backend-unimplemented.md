<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: idempotency `table` backend is unimplemented (silently == memory)

**Status:** 🔧 In Progress (found in 2026-08-27 review; epic reopened)
**Priority:** high
**Effort:** Medium
**Epic:** epic-middleware-request-lifecycle

## Summary

`src/middleware/idempotency.ts` only implements the `memory` backend.
`idempotent({ backend: "table", asyncStore })` behaves identically to
`memory`; the `asyncStore` parameter is never read (dead parameter). This
contradicts the AC in `TASK-middleware-idempotency-wire-into-elysia.md`
(the `table` backend should persist real `complete` rows via `asyncStore`)
and means multi-instance production gets no real replay. The lifecycle hooks
that would feed `complete` rows to the store are also not wired (see sibling
bugs).

## Acceptance Criteria

- [ ] Implement the `table` backend through `asyncStore` (read/write in-flight
      + complete via the store), OR remove the `backend: "table"` option and
      the dead `asyncStore` param until it is real.
- [ ] Test: two instances sharing the store replay the same key.
