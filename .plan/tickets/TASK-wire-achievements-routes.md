# TASK: Wire Achievements Routes

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-achievements

## Summary

Mount the code-complete `AchievementsService` (src/rpg/achievements/, backed by `achievements` + `player_achievements` tables, migration 035) under `/api/rpg/achievements` — CRUD + progress/claim — using the WIRED-7 mount pattern. It is currently CODE-COMPLETE + tested but has ZERO external importers. Display/trophy-case is separate frontend work tracked by FEAT-achievements.

## Acceptance Criteria

- [ ] Elysia route factory mounts AchievementsService under `/api/rpg/achievements` (CRUD + progress/claim), using `requireUserId` / `requireActorAccess` gating + `jsonResponse`/`jsonError` from `src/routes/http-utils`
- [ ] Route registers + typechecks cleanly
- [ ] Unit route tests added (bun:test, `createTestDb` + `src/test-utils/insert-helpers.ts`)

## Linked Epics

- `epic-achievements.md`
