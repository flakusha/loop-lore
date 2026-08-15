# TASK: Wire Quests Routes

**Status:** ✅ Done (2026-08-14, `51a7bc01`) — dual quest system consolidated (`src/rpg/quests/service/` removed) and wired to HTTP
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

## Residual Gap

Wiring mounted the consolidated engine, but the create form still emits
narrative-role values (`main|side|bounty|daily`) as `type`, while the backend
`QuestType` enum is completion-mechanic (`time|collection|...`). This 422s on
submit. Harmonized separately in TASK-harmonize-quest-type-taxonomy.
