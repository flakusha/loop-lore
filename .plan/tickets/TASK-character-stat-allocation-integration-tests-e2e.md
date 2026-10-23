<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Character Stat Allocation Integration Tests E2E

**Epic:** epic-character-core-system
**Related:** TASK-world-requires-stats-flag-and-point-budget-config, TASK-character-trait-catalog-for-gameplay-mechanics, TASK-character-stat-modifiers-and-trait-application-engine, TASK-character-stat-allocation-backend-api-and-db-integration, TASK-character-stat-allocation-frontend-modal-and-edit-integration

**Status:** Done

**Progress (2026-10-23, worktree char-stat-traits):**
- Service tests extended (`src/rpg/service/stat-allocation.test.ts`, 8 pass): duplicate traitIds collapse, empty traitIds allowed, custom-bounds world (`stat_min 6`) accepted via `statCost` fallback.
- Route tests (`src/routes/rpg/stat-allocation.test.ts`, 8 pass): GET 404, PUT roundtrip, budget-overflow 422, auth 401, catalog scoping, `stat-config` custom-world bounds + 404/401.
- E2E flow (`tests/e2e/flows/stat-allocation.test.ts`, `/api/v1/rpg/...`, 5 pass): catalog universal list, PUT+GET roundtrip, overflow 422, live `stat-config` bounds assertion.
- `statCost()` unit tests (`src/rpg/stats/validation.test.ts`): table parity 8–15, below-floor free, above-ceiling capped.
- Remaining gaps: combat/dice trait-floor checks belong to the modifiers/engine ticket (Done); migration roundtrip covered by existing `src/db/migrations.test.ts`.
- Wontfix by design: acceptance items (4) `POST /api/actors` rejection and actor-scoped `PUT /api/actors/:id/stat-allocation` path were never built — actors carry no worldId so there is no world context at actor scope; the shipped contract is world-scoped (`/api/v1/rpg/stat-allocation/:actorId` + `worldId` in body, `requires_stats` gates the panel). E2E locks the shipped contract (catalog, PUT+GET roundtrip, 422 overflow, live `stat-config` bounds); it does not cover the unbuilt actor-scoped paths.
**Priority:** medium
**Effort:** Medium

**Summary:**

End-to-end + service-level coverage tying the five sibling tickets together (DB + engine + routes).

**Context:**

Five sibling tickets ship DB, catalog, engine, API, and FE slices. Without a tying suite the gates can drift (engine and DB agreed on column types but the API reads them wrong; FE submits a payload the API rejects silently). This ticket locks the contract end-to-end so a regression anywhere along the chain shows up as one failure with a clear stack.

**Acceptance Criteria:**

Suites under `tests/e2e/` (routes) and `src/rpg/` (engine). (1) DB: migration applies, `requires_stats=1` + budget=27 roundtrip, PK uniqueness, FK rejection. (2) Engine: point-buy math (8–15 / 27 pts), overflow + out-of-range rejected, trait scope mismatch rejected, `assertTraitIds` unknown-id rejection, empty `traitIds` allowed, duplicate `traitIds` collapsed. (3) Combat + dice: `rollWithTraits(d20, dex, [fast_reflexes])` lifts low rolls to declared floor, two `roll_floor` traits take higher floor, `innate_magic` raises arcana, `swift_hands` lifts sleight_of_hand. (4) Routes: `POST /api/actors` rejects when `requires_stats` and no allocation, `PUT /api/actors/:id/stat-allocation` persists, `GET /api/rpg/trait-catalog?worldId` returns scoped list. Coverage ≥80% on `src/rpg/traits/`, `src/rpg/stats/`, `src/routes/character-stat-allocation.ts`. Gate: `bun run check` green after `bun run db:sync-types && bun run db:sync-manifest`.

