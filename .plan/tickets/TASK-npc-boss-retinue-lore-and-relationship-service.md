<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: NPC Boss Retinue Lore And Relationship Service

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-npcs
**Tags:** npc, retinue, relationship

**Summary:**
Service that authors each retinue member with a unique lore block and tracks per-pair relationships (boss <-> guard, guard <-> guard).

**Context:**
When a retinue spawns, each member should have a relationship to the boss (loyal/hired/coerced/cultist) and a stub of lore referencing the boss. This avoids the "anonymous mob" feel.

**Acceptance Criteria:**
- On retinue creation, run an AUX prompt block (`lifecycle/generate_retinue`) producing per-member backstory snippets keyed to the boss.
- Relationship: each member has `relationship_boss: {loyalty, intensity}`; members-to-each-other seeded as `{ stranger }`.
- Reads: `getRetinue(bossId)` returns boss + members + relationships.
- Writes: relationship changes through existing `src/characters/relationships-service.ts` reused with retinue schema hook.
- Tests: lore uniqueness per member; relationships persist on member leave/return.
