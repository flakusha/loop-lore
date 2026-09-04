<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add HeatPhase state machine for character_heat_cycle.current_phase

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-character-core-system

## Summary

Replace string-typed current_phase in character_heat_cycle with HeatPhase state machine. Must create/extend a HeatPhase StateDef + createMachine, export from index, and add a `CharacterHeatCycle.current_phase` COLUMN_TYPE_OVERRIDES mapping (then `bun run db:sync-types`). No migration. See Analysis below: existing HeatPhase values conflict with this ticket's proposed transition set.

## Analysis (2026-09-04)

**STALE — re-scope before implementing.** `HeatPhase` already exists (`src/db/enums-character/nsfw.ts`) as `normal|pre_heat|heat|post_heat`; this ticket proposes `normal→heat→cooling`, which conflicts with the existing values. `character_heat_cycle.current_phase` is `TEXT DEFAULT 'normal'` (fresh DDL) — still no migration needed, but the enum `values`/`transitions` must reconcile with the existing `HeatPhase` rather than introduce a second definition. Decision required: extend existing `HeatPhase` vs. replace it.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
