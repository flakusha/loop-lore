<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-loot-budget-affordance-gate: Encounter loot reconciled against affordance lookup + rarity band

**Status:** 🟡 Partial (commit 625e36bd — `feat(agency): ship action-parser + affordance + scorer + budget-gate`; `enforceLootBudget(dropTable, encounterBudget, party)` pure-function landed in `src/services/loot/budget-gate.ts` + 11/11 tests green; pending wiring into `src/battle/` resolution path)
**Priority:** P2 (within EPIC-RESEARCH-AGENCY-AFFORDANCE)
**Effort:** 1-2 days
**Parent epic:** `epic-research-agency-affordance.md`
**Related:** `TASK-affordance-lookup-table` (upstream dependency), prior-batch `TASK-math-position-effect-columns` (encounter budget side), `src/services/actor-items.ts`, `src/characters/spec/enums.ts` (rarity), `epic-battle-action-systems.md`

**Summary:**

## Goal

When an encounter resolves, generated loot passes a **budget gate**: `drop_budget <= sum(rarity x quantity for items dropped)` (5e Sane Magical Prices × rechner-hub level bands) AND `loot_pickups x affordance_matrix <= party_capabilities` (uses `TASK-affordance-lookup-table`).

**Context:**

## Why

- 5e economy: rarity x level-band pricing is the de facto standard for fantasy RPGs.
- Affordance gate prevents the LLM from dropping a `legendary` at L1 (party cannot use it) or a `magic_weapon` for a non-weapon-class party member.
- Combines the prior math batch (encounter budget side) with this batch's affordance work (item side) into a single enforcement point.

**Acceptance Criteria:**

- [ ] Pure function: `enforceLootBudget(drop_table, encounter_budget, party_capabilities) -> { allowed: LootRow[], dropped: LootRow[], reason: string }`.
- [ ] Rarity band matrix seeded: Common L1+, Uncommon L5+, Rare L9+, Very Rare L13+, Legendary L17+.
- [ ] Affordance check: each loot row evaluated via `TASK-affordance-lookup-table`; mismatched items either rerolled (rarity downshift) or moved to `dropped`.
- [ ] Hooks into the battle-resolution path (`src/battle/`, `epic-battle-action-systems.md`).
- [ ] Unit tests: positive (mid-level party + matching loot) and negative (L1 party + legendary) cases.

## Out of Scope

- Player-driven loot negotiation (separate epic; `epic-battle-action-systems` may own).
- Cross-genre economy scaling (5e baseline; Pathfinder/PbtA differ).
- Dynamic pricing per world (config-driven for now; tune later).


git issue: 5a3f199
