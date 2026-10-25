<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Relationship bidirectional reverse row grafts onto foreign characters

**Status:** Done
**Status Note:** resolved 2026-10-25 (`fix/bug-sweep`) — POST /api/v1/actors/:actorId/relationships (src/routes/character-relationships.ts:110-134) now rejects self-reference with 400 and validates the target actor (404 when missing or foreign-tenancy, admin override via admin.character) before the service inserts — the bidirectional reverse row can no longer graft relationship data onto another user's character, and a missing target 404s instead of FK-500ing; createRelationship (src/characters/services/relationships-service/write.ts:32-40) adds the matching self-reference guard for non-route callers. Repros pinned in src/routes/character-relationships.test.ts (foreign-target graft / self-reference / nonexistent target; 29/29 pass — all three failed before with 201+graft / 201 self-row / FK 500). Gates: typecheck + eslint green 2026-10-25, worktree fix/bug-sweep, issue BUG-RELATIONSHIP-BIDIRECTIONAL-REVERSE-ROW-GRAFTS-ONTO-FOREIGN-C.
**Priority:** high
**Effort:** Medium
**Epic:** epic-relationships

**Summary:**

Relationship creation never validates target_actor_id ownership: with is_bidirectional=true the service inserts a REVERSE row with actor_id = the OTHER user's character (src/characters/services/relationships-service/write.ts:66-84; route src/routes/character-relationships.ts:86-121) - user A grafts relationship data (type/standing/trust/metadata) onto user B's character. Nonexistent target -> FK 500 (001_init.ts:1355); self-reference unblocked. Fix: verify target exists and shares the caller's tenancy before insert; reject self-reference; also map service not-found throws (write.ts:119-123) to typed 404 instead of uncaught 500.

**Context:**

Closure rationale (2026-10-25, branch `fix/bug-sweep`): POST /api/v1/actors/:actorId/relationships (src/routes/character-relationships.ts:110-134) now rejects self-reference with 400 and validates the target actor (404 when missing or foreign-tenancy, admin override via admin.character) before the service inserts — the bidirectional reverse row can no longer graft relationship data onto another user's character, and a missing target 404s instead of FK-500ing; createRelationship (src/characters/services/relationships-service/write.ts:32-40) adds the matching self-reference guard for non-route callers.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Review 2026-10-04

OPEN on dev - src/characters/services/relationships-service/write.ts:66-84 inserts the bidirectional reverse row with actor_id = opts.targetActorId, no tenancy/ownership validation and no self-reference rejection; not-found throws remain plain Error (:120-123, :199-202) -> uncaught 500. The route performs no target ownership check (src/routes/character-relationships.ts:86-121). Full history of write.ts on all branches: refactors/lint only; no worktree modifies it.

**Resolved:** 2026-10-25 registry-driven close: git issue 7dc52b2 (registry tip: 66d37ac24 Konstantin Fedotov Close issue)
