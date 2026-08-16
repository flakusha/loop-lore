<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add `timeline_id` to `world_timeline_events`

**Status:** Draft
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

- [ ] Migration `031_world_timeline_id.ts` created
- [ ] Existing rows default to `'prime'`
- [ ] Index on `(world_id, timeline_id, occurred_at)` for fast timeline queries
- [ ] `WorldTimelineEvents` interface in `schema-core.ts` updated
- [ ] `db:sync-types` + `db:sync-manifest` pass
- [ ] `db:schemas:check` green

## Related

- Lore Knowledge epic (reads `timeline_id` for lore scoping)
- Rarity Extensions epic (reads `timeline_id` for rarity multiplier)
