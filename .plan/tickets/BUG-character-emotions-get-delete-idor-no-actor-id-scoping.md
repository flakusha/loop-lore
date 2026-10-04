<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Character emotions GET/DELETE IDOR - no actor_id scoping

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

src/routes/character-emotions/actor.ts:96-109 (GET one) and :206-211 (DELETE): the actor-ownership check passes, then both queries operate on the character_emotions row id alone (no .where actor_id) - cross-tenant read of emotion rows (actor_id/intensity/context leak) and cross-tenant delete; DELETE returns ok:true even when nothing matched. Fix: add .where("actor_id","=",actorId) to both; 404 on no-match delete.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
