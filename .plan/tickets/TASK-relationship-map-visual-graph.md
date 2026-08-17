# TASK: Relationship Map — visual graph

**Status:** ⬜ Not Started
**Priority:** high
**Labels:** npc
**Epic:** epic-npc-management-ui.md
**Git Issue:** 5a2a0cd

## Summary

Implement relationship map visualization showing NPC-to-NPC and player-to-NPC relationships with type/color coding. Phase 2 of `epic-npc-management-ui.md`. Mock data — no backend dependency.

## Scope

- Visual relationship graph (node-link)
- NPC-to-NPC and player-to-NPC edges
- Relationship types (friend/rival/enemy/ally) with color coding
- Relationship strength and history
- Node click → NPC details panel

## Notes

- Phase 2 of the NPC Management UI epic (see `epic-npc-management-ui.md`)
- Uses mock data — no backend dependency

## Files to Create

- `src/frontend/npc/relationship-map.ts` — relationship visualization

## Acceptance Criteria

- [ ] Graph renders with nodes and color-coded edges
- [ ] NPC-to-NPC and player-to-NPC relationships shown
- [ ] Relationship type + strength + history
- [ ] Click node opens NPC details panel
- [ ] Mobile responsive
