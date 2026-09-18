<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Character Trait Catalog For Gameplay Mechanics

**Epic:** epic-character-core-system
**Related:** TASK-character-stat-modifiers-and-trait-application-engine, TASK-character-stat-allocation-backend-api-and-db-integration

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

Typed, world-bounded catalog of gameplay-impact traits (`fast_reflexes`, `innate_magic`, `swift_hands`, `iron_will`, `keen_observer`, `shadow_step`, `sturdy_frame`, `silver_tongue`, …) feeding the dice / combat / saves pipeline.

**Context:**

Define a typed, world-bounded catalog of gameplay-impact traits in `src/rpg/traits/catalog.ts`. Each entry is a frozen object with: `id`, `label`, `worldIdScope` (array | `"*"`), effects (discriminated union of `ability_bonus` | `skill_bonus` | `roll_floor` | `save_proficiency` | `hp_bonus_per_level`). Export `TRAIT_CATALOG` (array), `getTraitsForWorld(worldId) -> Trait[]`, and `assertTraitIds(ids[])` — fail-closed validator. Seed with ≥8 traits covering every effect kind. Universal traits apply to every world; scoped traits require `worldIdScope` to contain the active world. Catalog frozen via `Object.freeze`; runtime mutations are owned by the `character_trait_assignments` table (see TASK-character-stat-allocation-backend-api-and-db-integration).

**Acceptance Criteria:**

- [ ] `src/rpg/traits/catalog.ts` exports `TRAIT_CATALOG`, `getTraitsForWorld`, `assertTraitIds`
- [ ] Catalog frozen (`Object.freeze`); at least 8 seed traits across all effect kinds
- [ ] `assertTraitIds` throws on unknown id; `getTraitsForWorld` honors `worldIdScope`
- [ ] Effects discriminated union is fully typed end-to-end (no `any`)
- [ ] Tests cover every effect kind + scope filtering + unknown-id rejection
