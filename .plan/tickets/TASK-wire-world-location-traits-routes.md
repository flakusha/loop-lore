# TASK: Wire World Location Traits Routes

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-locations

## Summary

Mount the code-complete `WorldLocationTraitsService` (src/rpg/world-location-traits/, backed by `character_world_traits` + `character_location_traits`, migration 010) under `/api/rpg/world-location-traits` — world + location traits + aggregate — using the WIRED-7 mount pattern. Currently CODE-COMPLETE + tested but with ZERO external importers.

## Acceptance Criteria

- [ ] Elysia route factory mounts WorldLocationTraitsService under `/api/rpg/world-location-traits` (world + location traits + aggregate), using `requireUserId` / `requireActorAccess` gating + `jsonResponse`/`jsonError` from `src/routes/http-utils`
- [ ] Route registers + typechecks cleanly
- [ ] Unit route tests added (bun:test, `createTestDb` + `src/test-utils/insert-helpers.ts`)

## Linked Epics

- `epic-locations.md`
