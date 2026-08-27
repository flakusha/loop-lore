# BUG: story-items cross-world IDOR read transfer destroy

**Status:** ✅ Resolved (build-break removed + fix compiles in worktree merge-review-followups, 2026-08-27)
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


## Review Update (2026-08-27)

The merge that carried this fix (`3ab26ccd`) **broke the backend build**: a malformed 3-way merge left an orphaned duplicate `transfer` body in `src/story/items/instances.ts:192-260` (tsc TS1128) and a stale duplicate `destroy` in `src/story/items/index.ts:122-125`. The IDOR fix therefore cannot run. Tracked in `BUG-security-merge-build-break-instances-ts.md`. Status stays 🔧 In Progress.


## Resolution (2026-08-27)

The build-break from merge `3ab26ccd` was fixed in worktree `merge-review-followups`: orphaned duplicate `transfer` body removed from `src/story/items/instances.ts` and stale duplicate `destroy` removed from `src/story/items/index.ts`. The IDOR fix now compiles and is functional. This bug is **resolved** (tracked in `BUG-security-merge-build-break-instances-ts.md`, also resolved).
