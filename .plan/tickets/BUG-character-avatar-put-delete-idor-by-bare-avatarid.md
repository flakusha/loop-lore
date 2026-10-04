<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Character avatar PUT/DELETE IDOR by bare avatarId

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

src/routes/character-avatars.ts:105-156 authorize the PATH actor (requireActorAccess) then update/delete by bare avatarId with no check that the avatar belongs to that actor (service unscoped, src/characters/services/avatar/crud.ts:142-206): owner of any actor can modify another tenant's avatar by id. The sibling GET in character-avatars-extra.ts:56-61 already has the fix (avatar.actorId !== actorId -> 404) - the flat-file routes never got it. Fix: fetch the avatar, 404 unless avatar.actorId === path actorId, before update/delete; add avatarId-level IDOR regression tests (only actor-level ownership is tested today).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
