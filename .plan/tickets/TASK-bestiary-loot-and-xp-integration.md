<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Bestiary Bestiary Loot And XP Integration

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-enemies-monsters
**Tags:** bestiary, loot, xp

**Summary:**
Route species deaths into the economy/crafting loot table and into the RPG XP award.

**Context:**
`BestiaryEntry.lootTableId` and `xpReward` should fire when a death event is recorded against a population. Reuses `src/rpg/loot` and the existing XP award path.

**Acceptance Criteria:**
- On `LocationPopulation` decrement (non force-cull), read `BestiaryEntry.lootTableId`, roll a loot drop, route to attacker inventory or shared pool.
- Award `xpReward` to the killer via existing `awardXp` service.
- Skip loot when admin force-cull (admin endpoint sets `audited: true` flag).
- Tests: monster kill rolls loot table; XP awarded; force-cull does NOT roll loot.
