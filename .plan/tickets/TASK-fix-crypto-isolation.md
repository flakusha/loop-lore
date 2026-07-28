# TASK: Fix Crypto Test Isolation Issue

**Status:** ✅ Done (was misdiagnosed)
**Priority:** High
**Effort:** Med
**Epic:** epic-testing-qa

## Summary

The crypto test isolation issue was a misdiagnosis. Crypto tests (69/69) pass in both isolated and full suite modes. The actual failures were in QuestService tests (16 failures) due to missing FK records in test setup.

## Root Cause (Actual)

QuestService tests used hardcoded `world_id: "world-1"` and `creator_id: "user-1"` without creating the referenced records in the test DB. The `quests` table has foreign keys on `world_id → worlds.id` and `creator_id → actors.id`.

## Fix Applied

- Updated `src/rpg/quests/service.test.ts` to use `createTestDb()` + `createTestActors()` + `createTestWorld()`
- Fixed `QuestService.getQuest()` to return `null` instead of `undefined` for non-existent quests
- Order matters: `createTestActors` must run before `createTestWorld` (worlds.owner_id → users.id)

## Remaining Failures (Pre-existing)

- GameMasterService — 3 test failures (LLM mocking issues)
- i18n — 1 error (document.addEventListener in non-DOM test env)

## Acceptance Criteria

- [x] 16/16 QuestService tests pass in full suite
- [x] 69/69 crypto tests pass in full suite
- [x] Root cause documented
