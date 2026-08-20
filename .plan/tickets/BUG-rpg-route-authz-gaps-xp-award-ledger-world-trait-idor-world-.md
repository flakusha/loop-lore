<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: RPG route authz gaps: XP award/ledger + world-trait IDOR + world tick

**Status:** ✅ Closed (2026-08-20, worktree `rpg-authz-fix`)
**Priority:** high
**Effort:** Medium
**Epic:** epic-rpg-wiring-phase3
**Commit:** `rpg-authz-fix` worktree

## Summary

Security findings from wiring-close-out review (other agent's live worktree).

## Fixes Applied

1. **FIXED** `src/routes/rpg/xp-loot.ts` — `POST /rpg/xp/award` + `GET /xp/history` now gate with
   `requireActorAccess(database, actorId, ctx,)` after `requireUserId`. Any authed user can no longer
   award XP or read ledger for arbitrary actors.

2. **ALREADY FIXED** (pre-existing) — `src/routes/rpg/world-location-traits.ts` already uses
   `requireActorAccess` on all endpoints. The ticket was filed against a stale version of the file.

3. **FIXED** `src/routes/rpg/npc-navigation.ts` — `POST /worlds/:worldId/tick` now gates with
   `requireWorldOwner(database, worldId, userId, userRole,)` after `requireUserId`. World mutation
   requires world ownership (or admin/solo role).

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing (pre-existing unrelated test failures in age-gate/telemetry/SSE/generation)
- [x] Typecheck clean on changed files
