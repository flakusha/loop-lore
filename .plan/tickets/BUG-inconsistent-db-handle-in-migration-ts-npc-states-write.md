<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Inconsistent DB handle in migration.ts npc_states write

**Status:** Done
**Status Note:** already fixed on dev — commit d5d081305 ("fix: LOW world/travel — dead code, DB handle, location validation") changed the `npc_states` write in `src/rpg/world-travel/migration.ts` from the raw `db` handle to `handle` (`travelDb(db)`), the handle every other query in the module uses. The line the ticket cites (`:122`) has moved since; the write now sits at `migration.ts:187-192` and goes through `handle`.
**Priority:** low
**Effort:** Medium
**Caveats:** observability — the module now reaches every table through one handle, so a reader no longer has to check which of the two a statement took; the other checklist dimensions (TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency) are n/a — the handle choice changes no authorization, concurrency, rollback or idempotency behaviour

**Summary:**

The npc_states update (src/rpg/world-travel/migration.ts:122) uses the raw db handle while every other query in the module uses travelDb(db). Impact: None today but breaks the module's convention. Fix: Change db to handle at line 122.

**Context:**

`travelDb(db)` is the module's typed handle over the travel tables (`src/rpg/world-travel/types.ts`), and every query in `migration.ts` goes through it. The one exception the ticket named has been using the raw `db` handle since the module was written. Commit d5d081305 fixed that on dev — the `npc_states` write now uses `handle` — and the line the ticket cites (`:122`) no longer exists, because the module grew since.

No source change is needed here: the code site is already correct. What was missing was the record of that verification, which this ticket now carries.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Already fixed on dev by commit d5d081305 ("fix: LOW world/travel — dead code, DB handle, location validation"), which changed `await db.updateTable("npc_states",)` to `await handle.updateTable("npc_states",)` in the arrival transition. Verified against the current tree (`src/rpg/world-travel/migration.ts:187-192`): the write goes through `handle` (`travelDb(db)`), the same handle as the `npc_migrations` reads and writes around it, and the `db` handle in that module is now used only where a non-travel table is written (`awardArrivalXp`, `chargeBudget`). No source change in this batch.

**Resolved:** 2026-10-22 registry-driven close: git issue dfcf59f (registry tip: f579a5ddf Konstantin Fedotov Auto-closed: appended .md marker marks BUG-INCONSISTENT-DB-HANDLE-IN-MI)
