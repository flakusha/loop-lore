# BUG: RPG route authz gaps: XP award/ledger + world-trait IDOR + world tick

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-rpg-wiring-phase3

## Summary

Security findings from wiring-close-out review (other agent's live worktree).

1. src/routes/rpg/xp-loot.ts:129 + :169 — POST /rpg/xp/award + GET /xp/history gate only requireUserId; no requireActorAccess(database, body.actorId, ctx). Any authed user awards XP to / reads ledger of ANY actor. Other rpg routes use requireActorAccess.
2. src/routes/rpg/world-location-traits.ts:81 + :103 — PUT/DELETE /rpg/world/:id gate only requireUserId; service updateWorldTrait/deleteWorldTrait scoped by bare id → IDOR. Docstring claims actor-gating; these 2 endpoints bypass. Fix: resolve trait→actor then requireActorAccess.
3. src/routes/rpg/npc-navigation.ts:132 — POST /worlds/:worldId/tick mutates all NPCs in any world, no world-ownership check.

Fix before merge — security-relevant, not just lint.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
