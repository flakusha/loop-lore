<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: World Requires Stats Flag And Point Budget Config

**Epic:** epic-character-core-system
**Related:** TASK-character-trait-catalog-for-gameplay-mechanics, TASK-character-stat-allocation-backend-api-and-db-integration

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

Extend the `worlds` table with RPG-config columns so a world can declare stat-block requirements on character creation/edit.

**Context:**

Add columns: `requires_stats` (integer 0/1, default 0 — gates the new character edit modal flow), `stat_point_budget` (integer, default 27 — point-buy budget per the existing `src/rpg/stats/types.ts` point-buy model), `stat_min` (integer, default 8), `stat_max` (integer, default 15). Coexists with the existing `rpg_enabled` flag (`src/db/migrations/parts/003_worlds.ts:187`): `requires_stats` implies `rpg_enabled` but does not replace it. Forward migration adds the columns; existing rows get defaults so back-compat is preserved. Regenerate the downstream artifacts (`src/db/schema.ts`, `src/db/schema-core.ts`, `src/db/schema-manifest.ts`, `src/test-utils/insert-helpers.ts`, `src/validation/db-schemas.ts`) via `bun run db:sync-types && bun run db:sync-manifest`. Column types surfaced in `src/db/column-types.ts`.
**Acceptance Criteria:**

- [ ] Migration adds the four columns with sensible defaults; existing rows back-compat preserved
- [ ] `SELECT` against `worlds` returns the new columns
- [ ] Roundtrip migration green; column types surfaced in `src/db/column-types.ts`
- [ ] Regenerated downstream artifacts pass `schemas:check`; existing world tests pass

