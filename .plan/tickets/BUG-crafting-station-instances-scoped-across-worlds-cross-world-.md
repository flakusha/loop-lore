# BUG: Crafting station instances scoped across worlds — cross-world read/write

**Status:** ✅ Done
**Priority:** high
**Effort:** Medium

## Summary

src/routes/crafting/station-instances.ts:132 — updateInstance/getInstance fetch by bare instanceId after world-owner check on a different path param; instance from another world readable/mutable. Fix: scope query by worldId.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Added `world_id` filter to `StationsService.getInstance/updateInstance/deleteInstance` WHERE clauses; introduced `getInstanceById` for auth-then-mutate flows; updated both `/api/worlds/:worldId/...` and `/api/rpg/crafting/station-instances` route handlers to pass the scoped world ID; added a cross-world regression test in `stations.test.ts` that confirms GET/PUT/DELETE all 404 from a different world while the original instance remains untouched.
