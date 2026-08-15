# TASK: Wire Replayability Routes

**Status:** ✅ Done (2026-08-14, `51a7bc01`) — wired to HTTP (`src/routes/rpg/replayability.ts` + schemas + tests)
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-replayability

## Summary

Mount the code-complete `ReplayabilityService` (src/rpg/replayability/, playthrough + endings + meta + ngp, backed by `playthroughs` + `meta_progression`, migration 035) under `/api/rpg/replayability` — playthrough/endings/meta/ngp — using the WIRED-7 mount pattern. Currently CODE-COMPLETE + tested but with ZERO external importers.

## Acceptance Criteria

- [ ] Elysia route factory mounts ReplayabilityService under `/api/rpg/replayability` (playthrough/endings/meta/ngp), using `requireUserId` / `requireActorAccess` gating + `jsonResponse`/`jsonError` from `src/routes/http-utils`
- [ ] Route registers + typechecks cleanly
- [ ] Unit route tests added (bun:test, `createTestDb` + `src/test-utils/insert-helpers.ts`)

## Linked Epics

- `epic-replayability.md`
