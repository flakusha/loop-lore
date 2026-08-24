# BUG: N+1 queries in story world-state context per participant

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/story/world-state/context.ts:111-120 — per-participant npc_states query plus items.getNpcInventory(p.id) inside loop. Fix: single where actor_id in ids fetch; batch inventory via in clause.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
