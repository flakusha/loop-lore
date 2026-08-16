<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add `timeline_id` + `reveal_condition` to lore entries

**Status:** Draft
**Priority:** High
**Epic:** `epic-lore-knowledge.md`
**Type:** Migration

## What

Add `timeline_id` column to `world_lore_entries` and `actor_lore_entries`, plus `reveal_condition` column to both tables.

## Why

Lore Knowledge epic requires timeline-specific lore (entries that only exist in certain timeline branches) and secret lore with conditional revelation.

## Schema Change

```sql
ALTER TABLE world_lore_entries ADD COLUMN timeline_id TEXT NOT NULL DEFAULT 'prime';
ALTER TABLE world_lore_entries ADD COLUMN reveal_condition TEXT;
ALTER TABLE actor_lore_entries ADD COLUMN timeline_id TEXT NOT NULL DEFAULT 'prime';
ALTER TABLE actor_lore_entries ADD COLUMN reveal_condition TEXT;
```

- `timeline_id` default `'prime'` for existing entries
- `reveal_condition` is nullable JSON: `{"type": "event|action|rarity", "ref": "...", "threshold": 0.5}`

## Acceptance Criteria

- [ ] Migration `032_lore_timeline_id.ts` created
- [ ] Both tables updated with new columns
- [ ] `reveal_condition` JSON schema validated on insert/update
- [ ] `WorldLoreEntries` + `ActorLoreEntries` interfaces in `schema-story.ts` updated
- [ ] `db:sync-types` + `db:sync-manifest` pass
- [ ] `db:schemas:check` green

## Related

- Memory Propagation epic (defines propagation rules for lore)
- Rarity Extensions epic (uses `reveal_condition` rarity thresholds)
