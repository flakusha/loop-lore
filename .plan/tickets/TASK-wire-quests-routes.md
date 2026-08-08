# TASK: Wire Quests Routes
**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-quests-encounters
## Summary
After the dual quest engines are consolidated (see TASK-consolidate-quest-engines), mount `QuestService` (src/rpg/quests/, CRUD + objectives + progression + rewards, backed by `quests` + `quest_progress`, migration 001/p07) under `/api/rpg/quests` using the WIRED-7 mount pattern.
## Acceptance Criteria
- [ ] Elysia route factory mounts QuestService under `/api/rpg/quests` (CRUD + objectives + progression + rewards), using `requireUserId` / `requireActorAccess` gating + `jsonResponse`/`jsonError` from `src/routes/http-utils`
- [ ] Route registers + typechecks cleanly
- [ ] Unit route tests added (bun:test, `createTestDb` + `src/test-utils/insert-helpers.ts`)
## Linked Epics
- `epic-quests-encounters.md`
