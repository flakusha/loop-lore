<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: idempotency table backend accepted but never implemented (silent memory fallback)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Resolved — closed 2026-09-14
**Priority:** medium
**Effort:** Medium

## Summary

src/middleware/idempotency.ts IdempotencyConfig accepts backend: table and an asyncStore, but the implementation only ever uses the in-memory Map (memory.get/put/markInFlight); asyncStore and backend === table are never consulted. Selecting table silently behaves like memory, losing restart/error resilience and cross-instance sharing that the doc comment promises. Fix: implement the table backend (read/write request_results via the async store) or remove the table option and its documentation.

## Resolution

Resolved by Bucket A commit `a738bc81 fix(idempotency): default backend to 'table' so asyncStore.track() runs by default`. The table backend is now fully implemented in `src/middleware/idempotency-table.ts` (258 lines) and wired in `src/middleware/idempotency.ts:99-101` (`createTableBackend(cfg.ttlMs, requireAsyncStore(config, "table"),)`). The `requireAsyncStore` guard at `src/middleware/idempotency.ts:228-236` fail-fasts when `backend === "table"` is selected without an `asyncStore` — the silent memory fallback no longer exists.

Regression-protected by `src/config/schema-class/idempotency.test.ts:19-23` which asserts `IDEMPOTENCY_DEFAULTS.backend === "table"` and explicitly guards against flipping back to `"memory"`. Gate evidence: idempotency unit tests 38/38 pass; full `bun run check:parallel --gates "typecheck - backend,lint - oxlint (correctness),format - dprint,db - schema gate,coverage - per-module line %"` 5/5 pass on `ticket-work @ 810143d02` (report at `.tmp/check-report.json`).

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
