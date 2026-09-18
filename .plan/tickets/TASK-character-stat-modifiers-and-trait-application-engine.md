<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Character Stat Modifiers And Trait Application Engine

**Epic:** epic-character-core-system
**Related:** TASK-character-trait-catalog-for-gameplay-mechanics, TASK-character-stat-allocation-backend-api-and-db-integration

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

Wire trait effects into the existing RPG modifier pipeline (`src/rpg/stats/modifiers.ts`, `src/rpg/combat/`, `src/rpg/stats/types.ts`).

**Context:**

The catalog and the DB-bound allocations only matter if dice, combat, and saves actually consume them. This ticket wires the trait effects into the existing `src/rpg/stats/modifiers.ts` pipeline so every roll outcome reflects the character's allocated stats and assigned traits. Roll floors must be deterministic and stack-predictable so GMs can reason about outcomes without hidden variance.

**Acceptance Criteria:**

Add `applyTraits(stats: StatBlockWithModifiers, traits: AppliedTrait[], context?: {kind: "attack"|"save"|"check", ability?: AbilityName, skill?: SkillName}) -> ResolvedRollContext`. The function composes base ability modifier, skill proficiency (`src/rpg/skills/`), and trait effects into `{ abilityMod, skillMod, rollFloor, proficiencyApplied, sourceTraits }`. Floor semantics: `roll_floor` raises the minimum success value for the named context; `minimumRollValue(context, traits, baseFloor)` lifts low rolls. Stack rule: two `roll_floor` traits in the same context take the higher floor. `rollWithTraits(dice, ability, traits)` lives in `src/rpg/dice/trait-roll.ts`. All consumer signatures stay additive.

