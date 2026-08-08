# TASK: Wire XP & Loot Routes
**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-rpg-mechanics
## Summary
Mount the code-complete xp + loot engines, which currently have no production consumers, under `/api/rpg/xp` (award/level) and `/api/rpg/loot` (generate/table) using the WIRED-7 mount pattern. XP is pure funcs at `src/rpg/xp/` + persistence at `src/rpg/service/xp.ts` (backed by `xp_ledger`, migration 026); loot is pure funcs at `src/rpg/loot/` + `src/rpg/service/loot-tables.ts` (backed by `loot_tables` + `loot_entries`, migration 026).
## Acceptance Criteria
- [ ] Elysia route factory mounts XP (`/api/rpg/xp` award/level) and loot (`/api/rpg/loot` generate/table) with shared persistence, using `requireUserId` / `requireActorAccess` gating + `jsonResponse`/`jsonError` from `src/routes/http-utils`
- [ ] Routes register + typecheck cleanly
- [ ] Unit route tests added (bun:test, `createTestDb` + `src/test-utils/insert-helpers.ts`)
## Linked Epics
- `epic-rpg-mechanics.md`
