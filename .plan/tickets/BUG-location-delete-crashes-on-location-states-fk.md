# BUG: location DELETE crashes on location_states FK

**Status:** ✅ Resolved (fixed 2026-09-05)
**Priority:** high
**Effort:** Small

## Summary

src/routes/worlds/locations.ts:271-291 nulls chats.current_location_id + deletes row but never deletes location_states; FK no CASCADE (migration parts/003_worlds.ts:16) -> 500 on any initialized location; world delete does the cleanup (worlds.ts:179-180). Fix: delete location_states first (or cascade).

## Resolution

Fixed in `handleDeleteLocation` (`src/routes/worlds/locations.ts`): after unlinking `chats.current_location_id`, `location_states` rows are deleted before the `locations` row, mirroring the world-delete cleanup in `worlds.ts:179-180`.

Tests: `src/routes/worlds/locations-routes.test.ts` — "2.7: DELETE removes location_states first (no FK 500)" creates a location, seeds a `location_states` row, DELETEs the location → 204 with the `location_states` row gone and no FK 500. Full `bun test src/routes/worlds src/memory/purge.test.ts`: 30 pass, 0 fail.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated