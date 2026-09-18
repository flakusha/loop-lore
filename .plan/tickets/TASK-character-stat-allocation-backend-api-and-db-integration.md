<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Character Stat Allocation Backend API And DB Integration

**Epic:** epic-character-core-system
**Related:** TASK-world-requires-stats-flag-and-point-budget-config, TASK-character-trait-catalog-for-gameplay-mechanics, TASK-character-stat-modifiers-and-trait-application-engine, TASK-character-stat-allocation-frontend-modal-and-edit-integration

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

Persist allocated stat blocks and assigned traits per character via migration `023_character_stat_allocation` + new Elysia route.

**Context:**

Once the world declares a stat requirement and the catalog defines valid traits, the server must enforce that every actor created in (or moved to) a `requires_stats` world has an allocation row. The existing `src/routes/characters.ts` becomes the gatekeeper; a new sibling route owns read/write of allocations. Both layers share validation against the catalog and world config so the FE never has to duplicate business rules.

**Acceptance Criteria:**

Migration adds: (1) `character_stat_allocation(actor_id PK FK→actors, world_id FK→worlds, allocated_str/dex/con/int/wis/cha integer NOT NULL, allocated_at, allocated_by_user_id nullable)`; (2) `character_trait_assignments(actor_id FK, trait_id text, world_id FK, granted_at, granted_by_user_id nullable, PRIMARY KEY (actor_id, trait_id, world_id))` with trait_id verified against catalog at write-time. New `src/routes/character-stat-allocation.ts` mounted in `elysia-app.ts` exposes `GET /api/actors/:actorId/stat-allocation` (404 absent) and `PUT /api/actors/:actorId/stat-allocation` body `{ worldId, stats: StatBlock, traitIds: string[] }` validating against worlds `requires_stats / stat_point_budget / stat_min / stat_max` and `assertTraitIds`; 422 on budget overflow, out-of-range stat, unknown trait, wrong-scope trait; 200 on success. `POST/PUT /api/actors` and `PUT /api/actors/:id` reject (422) when the active world requires stats and no allocation row exists. Regenerate downstream artifacts (`bun run db:sync-types && bun run db:sync-manifest`). Validation uses Elysia `t` (TypeBox).

