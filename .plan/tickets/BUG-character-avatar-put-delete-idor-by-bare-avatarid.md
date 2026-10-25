<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Character avatar PUT/DELETE IDOR by bare avatarId

**Status:** Done
**Status Note:** stale-resolved (verified 2026-10-25) — PUT and DELETE /api/v1/character-avatars/:avatarId (src/routes/character-avatars.ts:124-130, :166-172) fetch the avatar and return 404 unless `avatar.actorId === actorId` before writing/deleting; driver-level IDOR regressions pinned in src/routes/character-avatars.test.ts:573-671 (describe "Authorization — resource-level (IDOR)", read/update/delete at :628/:639/:658).
**Priority:** high
**Effort:** Medium
**Epic:** epic-asset-transform-metadata

**Summary:**

src/routes/character-avatars.ts:105-156 authorize the PATH actor (requireActorAccess) then update/delete by bare avatarId with no check that the avatar belongs to that actor (service unscoped, src/characters/services/avatar/crud.ts:142-206): owner of any actor can modify another tenant's avatar by id. The sibling GET in character-avatars-extra.ts:56-61 already has the fix (avatar.actorId !== actorId -> 404) - the flat-file routes never got it. Fix: fetch the avatar, 404 unless avatar.actorId === path actorId, before update/delete; add avatarId-level IDOR regression tests (only actor-level ownership is tested today).

**Context:**

Closure rationale (verified 2026-10-25 against the current implementation): PUT and DELETE /api/v1/character-avatars/:avatarId (src/routes/character-avatars.ts:124-130, :166-172) fetch the avatar and return 404 unless `avatar.actorId === actorId` before writing/deleting; driver-level IDOR regressions pinned in src/routes/character-avatars.test.ts:573-671 (describe "Authorization — resource-level (IDOR)", read/update/delete at :628/:639/:658).

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Review 2026-10-04

Fix verified in worktree fix-avatar-idor (commit 4118634d3 "fix(routes): scope avatar PUT/DELETE to the path actor": src/routes/character-avatars.ts PUT and DELETE now getAvatar(avatarId) then 404 unless avatar.actorId === actorId, +23/-2, with regression tests in src/routes/character-avatars.test.ts +32; committed dev HEAD still authorizes the path actor only, then updates/deletes by bare avatarId); keep open until that branch finalizes/merges, then close.

**Resolved:** 2026-10-25 registry-driven close: git issue b9e9cfb (registry tip: 002e5a3f2 Konstantin Fedotov Close issue)
