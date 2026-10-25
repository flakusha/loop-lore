<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: move relationship update/delete existence check inside the txn

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Relationship update/delete existence check runs outside the transaction, inconsistent with the createRelationship pattern this file itself documents.

**Files:**

- src/characters/services/relationships-service/write.ts:128-139, 209-220

**Evidence:**

- `createRelationship` was explicitly fixed this week to run its duplicate guard inside the txn (comment at write.ts:46-50 documents the race), but `updateRelationship`/`deleteRelationship` still `getRelationship` on the outer handle, then write inside `withTransaction`. A concurrent delete between read and write makes the update/delete affect 0 rows and still return success (void), and the bidirectional twin branch keys off the stale `existing.isBidirectional`. No corruption on single-connection SQLite, but the guard/write pairing is inconsistent with the documented pattern (review-core.md F-9).

**Fix:**

Move the existence check (`getRelationship`) inside the `withTransaction` block for both update and delete, matching the createRelationship precedent at write.ts:46-50.

**Review:** .tmp/reviews/2026-10-25/ (2026-10-25 round) — review-core.md F-9.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
