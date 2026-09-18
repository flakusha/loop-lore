<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Character Stat Allocation Integration Tests E2E

**Epic:** epic-character-core-system
**Related:** TASK-world-requires-stats-flag-and-point-budget-config, TASK-character-trait-catalog-for-gameplay-mechanics, TASK-character-stat-modifiers-and-trait-application-engine, TASK-character-stat-allocation-backend-api-and-db-integration, TASK-character-stat-allocation-frontend-modal-and-edit-integration

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

End-to-end + service-level coverage tying the five sibling tickets together (DB + engine + routes).

**Context:**

Five sibling tickets ship DB, catalog, engine, API, and FE slices. Without a tying suite the gates can drift (engine and DB agreed on column types but the API reads them wrong; FE submits a payload the API rejects silently). This ticket locks the contract end-to-end so a regression anywhere along the chain shows up as one failure with a clear stack.

**Acceptance Criteria:**

Suites under `tests/e2e/` (routes) and `src/rpg/` (engine). (1) DB: migration applies, `requires_stats=1` + budget=27 roundtrip, PK uniqueness, FK rejection. (2) Engine: point-buy math (8–15 / 27 pts), overflow + out-of-range rejected, trait scope mismatch rejected, `assertTraitIds` unknown-id rejection, empty `traitIds` allowed, duplicate `traitIds` collapsed. (3) Combat + dice: `rollWithTraits(d20, dex, [fast_reflexes])` lifts low rolls to declared floor, two `roll_floor` traits take higher floor, `innate_magic` raises arcana, `swift_hands` lifts sleight_of_hand. (4) Routes: `POST /api/actors` rejects when `requires_stats` and no allocation, `PUT /api/actors/:id/stat-allocation` persists, `GET /api/rpg/trait-catalog?worldId` returns scoped list. Coverage ≥80% on `src/rpg/traits/`, `src/rpg/stats/`, `src/routes/character-stat-allocation.ts`. Gate: `bun run check` green after `bun run db:sync-types && bun run db:sync-manifest`.

