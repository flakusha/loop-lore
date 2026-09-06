# BUG: story: destroy() partial-quantity update path missing world_id where-clause

**Status:** ✅ Resolved
**Priority:** low
**Effort:** Medium

## Summary

src/story/items/instances.ts lines 219-224: the partial-quantity UPDATE path omits .where("world_id") while the delete paths include it. The initial select scopes to worldId so not an active exploit, but the inconsistency is a latent bug. Fix: add .where("world_id","=",worldId) to the update path.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

story/items/instances.ts partial-quantity UPDATE now includes .where('world_id') matching the delete path — closes latent cross-world mutation. (resolved 2026-09-06)
