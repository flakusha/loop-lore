<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: withWorldId undefined-means-no-filter: relationship read/update/delete can hit an arbitrary world row

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

`withWorldId` semantic flip changed relationship read/write/delete behavior for worldId-omitting callers: an update/delete can hit an arbitrary world's row.

**Files:**

- src/characters/services/shared-service-utils.ts:50-61
- src/characters/services/relationships-service/read.ts:59-66
- src/characters/services/relationships-service/write.ts:166-185, 222-239
- src/routes/character-relationships.ts:41, 63, 169, 197-199

**Evidence:**

- Commit 112895b79 ("CAS mood delta and world-agnostic mood lookups") removed the `world_id is null` branch from `withWorldId`, so `worldId === undefined` now adds **no** world filter. Motivated by mood lookups, but `getRelationship`/`updateRelationship`/`deleteRelationship` share the helper (review-core.md F-1).
- `getRelationship` does `executeTakeFirst()` with no ORDER BY (read.ts:59-66); when the same actor pair has rows in world A, world B and global (`character_relationships.world_id` is nullable, no composite unique), an update/delete without `worldId` (route takes it from an optional `ctx.query.worldId`, character-relationships.ts:169/197-199) reads and mutates an **arbitrary** world's pair.

**Fix:**

Make world-scope intent explicit per caller (globalOnly vs worldAgnostic helpers, or require worldId on relationship routes); `getRelationship` needs deterministic ordering or an ambiguity error.

**Related:** c1c56b0 (locations query loads all worlds — different defect, same world-scoping theme).

**Review:** .tmp/reviews/2026-10-25/ (2026-10-25 round) — review-core.md F-1.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
