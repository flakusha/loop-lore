# TASK: NPC Alpine Component — wire into app

**Status:** ⬜ Not Started
**Priority:** high
**Labels:** npc
**Epic:** epic-npc-management-ui.md
**Git Issue:** ddbc8a8

## Summary

Create `src/frontend/alpine/npc.ts` Alpine.js component registering all NPC sub-panels (viewer, relationship map, faction relations, karma). Wire into Alpine app index. Phase 5 of `epic-npc-management-ui.md`.

## Scope

- Alpine.js component registering all NPC sub-panels
- Wire into Alpine app index
- Integrate: viewer, relationship map, faction relations, karma panels

## Notes

- Phase 5 of the NPC Management UI epic (see `epic-npc-management-ui.md`)
- Depends on Phases 1-4 (panels must exist before registration)

## Files to Create

- `src/frontend/alpine/npc.ts` — Alpine.js NPC logic

## Acceptance Criteria

- [ ] `npc.ts` registers all NPC sub-panels
- [ ] Wired into Alpine app index
- [ ] Panels render in-app under NPC route
- [ ] (Integration depends on Phases 1-4)
