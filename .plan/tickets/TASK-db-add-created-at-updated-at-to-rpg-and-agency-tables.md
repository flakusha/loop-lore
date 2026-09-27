<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: DB: add created_at/updated_at to RPG and agency tables

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

## Summary

**Summary:**
Add `created_at` / `updated_at` to RPG/agency tables whose mutable state has no update stamp. Exact gaps:

- `meta_progression` → missing `created_at` (has `updated_at`, `metadata`)
- `rpg_questions` → missing `updated_at` (status, selected_option_id, answer_value mutate)
- `recipe_discoveries` → missing `updated_at` (mastery_level progresses; `discovered_at` covers creation)
- `status_effect` → missing `updated_at` (magnitude stacks; `started_at` covers creation)
- `profession_specializations` → missing `updated_at` (is_active, requirement fields mutate)
- `agency_play_counters` → missing `updated_at` (count increments per hour bucket)
- `agency_dimension_counters` → missing `updated_at` (total/meaningful increments)

**Context:**
Convention audit: `001_init.ts` defines `created_at text not null default (datetime('now'))`; most RPG tables already carry both stamps (`quests`, `battles`, `crafting_recipes`, `professions`). The gaps are counters/progress tables whose rows mutate continuously but expose only their birth stamp, plus `meta_progression` which has the opposite problem (`updated_at`/`metadata` but no `created_at`).

Naming note: `status_effect` already has an extensible column named `meta` — inconsistent with the repo-wide `metadata` convention (e.g. `achievements`, `loot_entries`, `playthroughs`). If touched, rename to `metadata` in the same migration (with generated-artifact regeneration) rather than adding a second column.

**Column definitions:**
- `created_at text` — new-table convention `notNull default (datetime('now'))`; here added via ALTER as nullable (SQLite forbids non-constant DEFAULT in ADD COLUMN), backfilled, then always written by insert paths.
- `updated_at text` — nullable on add; maintained by writers on every UPDATE. NO SQLite trigger: 001_init triggers are integrity-only and 011_actor_bdi_lite explicitly rejected trigger-based time enforcement; app-layer is the repo norm.

**Migration policy:**
- Append-only: new migration `018_*` (latest is `017_asset_links_archived_at.ts`). Never edit 001–017.
- Backfill in `up()`: `UPDATE meta_progression SET created_at = updated_at`; `recipe_discoveries SET created_at = discovered_at`; `status_effect SET created_at = started_at`; counters tables have no source stamp — leave NULL for pre-existing rows rather than fabricating; `UPDATE <t> SET updated_at = created_at WHERE updated_at IS NULL` elsewhere.
- Regenerate generated artifacts: `bun run db:sync-types && bun run db:sync-manifest`; `bun run schemas:check` green.

**Acceptance Criteria:**
- One `018_*` migration adds exactly the columns listed above to exactly the tables listed above; no other schema changes.
- Backfill UPDATEs present in `up()` as specified; no fabricated timestamps.
- Writers of affected tables set `updated_at` on mutation (counter increments included).
- `bun run db:sync-types && bun run db:sync-manifest` run; `schemas:check` green.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
