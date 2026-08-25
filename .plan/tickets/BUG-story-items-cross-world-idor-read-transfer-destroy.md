# BUG: story-items cross-world IDOR read transfer destroy

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Location: src/routes/story-items/handlers.ts (handleDefinition GET, handleTransfer, handleInstance DELETE), src/routes/story-items/definitions.ts, src/routes/story-items/instances.ts; service layer src/story/items/definitions.ts (getDefinition) and src/story/items/instances.ts (transfer/destroy).

Symptom: Service functions operate on ids only with NO world_id predicate: getDefinition(state, itemId) -> selectFrom(items).where(id, itemId) (no world_id); transfer/destroy(state, worldItemId, ...) -> world_items by id only. Route handlers call checkWorldOwnership(worldId) on a worldId that is NOT bound to the instance, then hand the instance id to these id-only services. Confirmed by direct source read. Result: a caller who owns world A can read item definitions of world B (getDefinition), and transfer/destroy world B's world_items (handleTransfer/handleInstance).

Root cause: the story-items service layer is id-only and never receives/enforces a worldId; handlers assume the instance belongs to the checked world.

Fix: add a worldId parameter to getDefinition/transfer/destroy and enforce .where(world_id, worldId); handler must assert instance.world_id === checkedWorldId before acting (404 on mismatch).

Acceptance: cross-world item definition read denied; cross-world transfer/destroy denied; owner succeeds; regression test (cross-world id) added.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
