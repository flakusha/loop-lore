<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add `timeline_id` to `world_timeline_events`

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Implemented (2026-09-10 — landed via final-form squash `e3b8edbf3`, verified on dev)
**Priority:** High
**Epic:** `epic-timeline-system.md`
**Type:** Migration

## What

Add `timeline_id` column to `world_timeline_events` table to support branching timelines.

## Why

Timeline System epic requires multiple concurrent timelines per world. Each event must belong to a specific timeline branch.

## Schema Change

```sql
ALTER TABLE world_timeline_events ADD COLUMN timeline_id TEXT NOT NULL DEFAULT 'prime';
```

- Default `'prime'` for existing events (single-timeline backward compat)
- Foreign key to a new `world_timelines` table (or `worlds.id` + timeline name composite)

## Acceptance Criteria

- [x] Migration `031_world_timeline_id.ts` created — SUPERSEDED: final-form parts tree (squash `e3b8edbf3`) carries `timeline_id` + `world_timelines` + `(world_id, timeline_id, occurred_at)` index in `parts/003_worlds.ts`
- [x] Existing rows default to `'prime'` — column `NOT NULL DEFAULT 'prime'`
- [x] Index on `(world_id, timeline_id, occurred_at)` — `idx_wte_world_timeline_occurred`
- [x] `WorldTimelineEvents` interface in `schema-core.ts` updated — `timeline_id: Generated<string>` + `WorldTimelines` interface
- [x] `db:sync-types` + `db:sync-manifest` pass
- [x] `db:schemas:check` green

## Verification Notes (2026-09-10)

- `src/db/migrations/parts/003_worlds.ts` L141 (`timeline_id` default `'prime'`), L145 (`world_timelines`), L274 index.
- Generated: `src/db/schema-core.ts` L242/L255, `src/db/schema-manifest.ts`, `src/db/schema.ts` L49.
- G2 followup (worktree `g2-timeline-steering`) folds `world_event_steerings` (§5.3) into the same part + backfill guard.

## Related

- Lore Knowledge epic (reads `timeline_id` for lore scoping)
- Rarity Extensions epic (reads `timeline_id` for rarity multiplier)
