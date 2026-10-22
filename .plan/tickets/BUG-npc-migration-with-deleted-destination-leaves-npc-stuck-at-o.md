<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: NPC migration with deleted destination leaves NPC stuck at origin

**Status:** Done
**Status Note:** the arrival transition now writes the NPC's position even when the destination is gone: an abandoned hop ends with the NPC at the origin it set out from (`src/rpg/world-travel/migration.ts:146-167`). The ticket's "stuck at the origin" claim was half right — the NPC was left wherever its own row said, which can be no location at all, and a hop that ends must leave the NPC at a location the world still has. The ticket's two proposed fixes were rejected: deleting the NPC state row removes the NPC from the world, and a "fallback location" is a location the codebase has no concept of.
**Priority:** medium
**Effort:** Medium
**Caveats:** stale state — the abandoned arrival writes the hop's origin, so an NPC the wander system carried off the hop's track during the hop is put back on it, the same authority the completed arrival already has over `npc_states.location_id`; partial failure — if the origin was deleted as well, the write is skipped and the NPC keeps the position it already had; observability — the hop is still recorded as `arrived` (the status CHECK constraint allows only planned/in_transit/arrived), so an abandoned hop remains distinguishable only by its null destination

**Summary:**

When a migration's destination_location_id is null (location deleted), the migration (src/rpg/world-travel/migration.ts:97-101) is marked arrived but npc_states.location_id is never updated. The NPC remains at the origin location forever. Impact: An NPC whose destination location was deleted is permanently stuck at its origin. Fix: Either delete the NPC state row, or move the NPC to a fallback location.

**Context:**

`npc_migrations.destination_location_id` is `set null` on delete, so a location deleted while an NPC is on the road leaves the hop with nothing to arrive at. The module's own contract (`src/rpg/world-travel/migration.ts:21-24`) is that such a hop is closed out rather than retried forever — that part was already right, and the ticket's "permanently stuck" impact does not hold for an NPC with a wander or patrol schedule, because `npc-navigation` moves those on their own.

What was actually wrong is narrower: the arrival transition is the one place that decides where the NPC stands when the hop ends, and on the abandoned path it decided nothing. The NPC was left with whatever position its own row carried — which may be no location at all, so the hop ends and the NPC is nowhere, invisible to the discovery and progress readers that filter on `npc_states.location_id`. The fix writes the hop's origin, the last position the hop itself asserted, so a hop that ends always ends with the NPC at a location the world still has.

Alternatives rejected: deleting the NPC state row (that removes the NPC's position, schedule, health and inventory from the world — strictly destructive); moving the NPC to a "fallback location" (the codebase has no fallback concept, and picking one location over another would be invented behaviour); a new `cancelled` status (the `ck_npc_migrations_status` CHECK constraint allows only planned/in_transit/arrived, and changing it means a table rebuild migration — out of proportion to this defect).

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

- `src/rpg/world-travel/migration.ts:146-167`: an arrival whose destination was deleted writes the hop's origin into `npc_states.location_id` (when the origin still exists) before closing the hop out.
- `src/rpg/world-travel/migration.ts:21-24`: the module contract now says the hop ends with the NPC back at its origin.
- `src/rpg/world-travel/travel.test.ts`: two new cases — "an arrival whose destination was deleted closes the hop out instead of retrying forever" (no action, status `arrived`, no ledger opened) and "an arrival whose destination was deleted leaves the NPC at the hop's origin" (the NPC's row carried no position; after the hop it stands at the origin). Verified as a genuine witness: without the write the second case fails with `null`.

**Resolved:** 2026-10-22 registry-driven close: git issue e70009f (registry tip: 475bb2112 Konstantin Fedotov Auto-closed: appended .md marker marks BUG-NPC-MIGRATION-WITH-DELETED-D)
