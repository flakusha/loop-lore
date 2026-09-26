<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Achievements enum revival — promote service-layer to db barrel

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** achievements
**Tags:** achievements, db-types, enum-consolidation, recovery

**Summary:** Revival ticket for the achievement enum code that was dropped from stash@{2} during the 2026-09-26 stash cleanup. The original patch (reverted in commit a5e333bb0 "revert(achievements): revert AchievementCategory + AchievementTier") added a 6-value duplicate enum to src/db/enums-story/rpg.ts that collided with the 8-value service-layer enum in src/rpg/achievements/service/types.ts.

Recovery direction (NOT a blind re-apply):
- Source of truth: src/rpg/achievements/service/types.ts (8 values: story/combat/exploration/social/crafting/collection/mastery/secret)
- Goal: promote that enum to src/db/enums-story/rpg.ts as a thin re-export so the DB schema generation can pick up the typed column-type for the existing Achievements table (per column-types.ts reverse map pattern).
- Result: the duplicate enum is replaced by a re-export, not a copy — schema-core.ts/insert-helpers.ts/validation/db-schemas.ts regenerations stay in lockstep with the service source of truth.

Salvage artifact: .tmp/achievement-enums-revival.diff (1.6 KB, dropped-stash snapshot).
Original chain: eeead1be9 feat(achievements) -> a5e333bb0 revert(achievements).

**Context:**

- `src/db/enums-story/rpg.ts` no longer defines `AchievementCategory` / `AchievementTier` — those enum literals were the duplicate that broke coverage.
- `src/rpg/achievements/service/types.ts` is the canonical source (8 values: story/combat/exploration/social/crafting/collection/mastery/secret).
- `src/db/column-types.ts` has no `Achievements` row map.
- Service code imports `AchievementCategory` / `AchievementTier` directly from the service module.
- Existing epic: epic-achievements.md awaits route wiring; this enum-promotion work unblocks the typed-column story for the existing `Achievements` table.

**Acceptance Criteria:**

- [ ] `src/db/enums-story/rpg.ts` re-exports the 8-value `AchievementCategory` and `AchievementTier` from `src/rpg/achievements/service/types.ts` (no copy-paste of literal values).
- [ ] `src/db/column-types.ts` carries the `Achievements` row → `category` / `tier` typed-column reverse map.
- [ ] `bun run db:schema` regenerates `src/db/schema-core.ts`, `src/db/validation/db-schemas.ts`, and `src/test-utils/insert-helpers.ts` so the `category` / `tier` columns resolve to the service-layer enum type (not a 6-value subset).
- [ ] Coverage gate stays green (no enum-value mismatch between DB-side and service-side definitions).
- [ ] `bun run check` green.

**Related:** src/rpg/achievements/service/types.ts, src/db/enums-story/rpg.ts, src/db/column-types.ts, .tmp/achievement-enums-revival.diff (salvage snapshot from stash@{2}), commit a5e333bb0 (the revert to bypass), commit eeead1be9 (the original feat), epic-achievements.md, epic-rpg-content-systems.md (dependency).
