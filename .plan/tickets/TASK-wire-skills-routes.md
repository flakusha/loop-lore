# TASK: Wire Skills Routes

**Status:** ✅ Done (2026-08-14, `51a7bc01`) — wired to HTTP (`src/routes/rpg/skills.ts` + schemas + tests)
**Priority:** High
**Effort:** Medium
**Epic:** epic-skills

## Summary

Mount the code-complete `SkillsService` (src/rpg/skills/, CRUD + tree + progression, backed by `character_skills`, migration 036) under `/api/rpg/skills` — CRUD + tree + progression — using the WIRED-7 mount pattern. Currently CODE-COMPLETE + tested but with ZERO external importers.

## Acceptance Criteria

- [ ] Elysia route factory mounts SkillsService under `/api/rpg/skills` (CRUD + tree + progression), using `requireUserId` / `requireActorAccess` gating + `jsonResponse`/`jsonError` from `src/routes/http-utils`
- [ ] Route registers + typechecks cleanly
- [ ] Unit route tests added (bun:test, `createTestDb` + `src/test-utils/insert-helpers.ts`)

## Linked Epics

- `epic-skills.md`
