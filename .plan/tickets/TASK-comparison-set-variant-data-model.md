<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Comparison set and variant data model

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `epic-technical-comparison-charts`
**Related:** `TASK-comparison-set-routes-crud-ownership-validation.md`, `TASK-comparison-fan-out-engine.md`, `epic-asset-platform-capabilities.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Add the persisted comparison-set entity: a set holds one prompt (or one reference set) plus N
variants, and a variant is the complete generation contract — backend, model/checkpoint, LoRA stack,
seed, sampler/scheduler, steps, CFG, resolution, reference set, edit mask.

## Context

No comparison-set table exists. `src/db/migrations/015_model_comparison_runs.ts` creates
`model_comparison_runs(id, user_id, prompt, results, ratings, metadata, created_at)` — that is the
LLM *output rating* table used by `src/routes/model-comparisons.ts` (`GET /api/comparisons`,
`POST /api/comparisons/:id/rating`), and this epic does not extend it.

Migration HEAD is `src/db/migrations/056_xp_ledger_dedupe_unique.ts`. Per
`src/db/migrations/README.md`, schema changes are append-only: create a new top-level
`src/db/migrations/NNN_*.ts` exporting `up(db)` / `down(db)`, auto-discovered by `getMigrationFiles()`
in `src/db/migrate.ts`. Derived artifacts are regenerated with `bun run db:sync-types &&
bun run db:sync-manifest`, then `bun run schemas:check`, and verified with `bun test
src/db/migrations.test.ts src/db/migration-roundtrip.test.ts`.

`src/db/schema.ts` and the per-domain schema files are generated — do not hand-edit. `src/db/enums-generation.ts`
is where a `ComparisonVariantStatus` enum (`queued|running|done|failed`) belongs, alongside the existing
`GenerationStatus`.

Tables to add:

- `comparison_sets(id, user_id, title, prompt, reference_set json, created_at)`
- `comparison_set_variants(id, set_id, position, backend, model, checkpoint, lora_stack json, seed,
  sampler, scheduler, steps, cfg, width, height, reference_set json, edit_mask_asset_id, status,
  error, asset_id, provider_progress json, locked, started_at, completed_at)`
- `comparison_set_runs(id, set_id, started_at, completed_at, status)`
- `comparison_variant_metrics(variant_id, metric_key, metric_value)`

`seed` is nullable on purpose: an unpinned seed is itself a comparability signal the UI renders, not a
rejected value. Output assets are ordinary `assets` rows, linked through the existing polymorphic
`asset_links` table by `linkAsset` (`src/assets/service/links.ts:23`).

`asset_renditions` does not exist in the schema yet; do not depend on it.

## Acceptance Criteria

- [ ] `src/db/migrations/NNN_comparison_sets.ts` exists with `up`/`down` and is auto-discovered (no wiring step added)
- [ ] `bun run db:sync-types && bun run db:sync-manifest && bun run schemas:check` clean; generated `src/db/schema.ts` + `src/db/schema-generation.ts` carry the four new tables
- [ ] `ComparisonVariantStatus` enum added to `src/db/enums-generation.ts` with values `queued`, `running`, `done`, `failed`
- [ ] A `seed` of NULL round-trips as NULL (not coerced to 0) and is readable back through a Kysely select
- [ ] `lora_stack` and `reference_set` round-trip as ordered JSON (order preserved, not sorted)
- [ ] `bun test src/db/migrations.test.ts src/db/migration-roundtrip.test.ts` green
