<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Battle Equipment Integration

**Status:** ✅ Partial (IS7 closed 2026-08-18)
**Priority:** medium
**Labels:** battle, equipment, durability
**Assignee**:
**Epic:** epic-battle-integration-gaps
**Related:** TASK-PLAN-UNWIRED-CODEOUT.md

## Summary

Planned work item for epic-battle-integration-gaps. Combat equipment durability
degradation (IS7) closed in worktree `feature/a8-unwired-closeout` (commit `a7ffbb70`).

## Completed (2026-08-18)

- [x] Migration `048_battle_equipment_durability.ts` — adds `durability`/`max_durability` columns to `actor_items`
- [x] `POST /api/battle/equipment/combat-use` route — `equipment-durability.ts`
- [x] Reuses engine `applyDurabilityDamage` for degradation logic
- [x] Persists degraded durability to `actor_items` table
- [x] Equipment durability tests pass (`equipment-durability.test.ts`)
- [x] DB schema artifacts regenerated (`schema-core`, `schema-manifest`, `insert-helpers`, `db-schemas`)

## Acceptance

- [x] Equipment durability degradation in combat (IS7)


git issue: 3d93144
