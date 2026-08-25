<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Wire NPC Navigation Routes

**Status:** ✅ Done (2026-08-14, `51a7bc01`) — wired to HTTP (`src/routes/rpg/npc-navigation.ts` + schemas + tests)
**Priority:** High
**Effort:** Medium
**Epic:** epic-npc-navigation

## Summary

Mount the code-complete `NpcNavigationService` (src/rpg/npc-navigation/, state + movement + processing + pathfinding, backed by `npc_states` + `location_states`, migration 001/p07) under `/api/rpg/npc-navigation` — move/pathfind/state — using the WIRED-7 mount pattern. Currently CODE-COMPLETE + tested but with ZERO external importers.

## Acceptance Criteria

- [ ] Elysia route factory mounts NpcNavigationService under `/api/rpg/npc-navigation` (move/pathfind/state), using `requireUserId` / `requireActorAccess` gating + `jsonResponse`/`jsonError` from `src/routes/http-utils`
- [ ] Route registers + typechecks cleanly
- [ ] Unit route tests added (bun:test, `createTestDb` + `src/test-utils/insert-helpers.ts`)

## Linked Epics

- `epic-npc-navigation.md`


git issue: d1ad853
