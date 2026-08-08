# TASK: Add `rarity_multiplier` to `world_timeline_events`

**Status:** Draft
**Priority:** Medium
**Epic:** `epic-rarity-extensions.md`
**Type:** Migration

## What

Add `rarity_multiplier` column to `world_timeline_events` to support timeline-weighted event rarity.

## Why

Rarity Extensions epic needs per-timeline control over event probability. Example: "Golden Age" timeline boosts rare event rates.

## Schema Change

```sql
ALTER TABLE world_timeline_events ADD COLUMN rarity_multiplier REAL NOT NULL DEFAULT 1.0;
```

- Default `1.0` (no modification) for existing events
- Range: `0.5` (half rarity) to `2.0` (double rarity)
- Add check constraint: `rarity_multiplier BETWEEN 0.1 AND 5.0`

## Acceptance Criteria

- [ ] Migration `033_timeline_rarity_multiplier.ts` created
- [ ] Existing rows default to `1.0`
- [ ] Check constraint enforces valid range
- [ ] `WorldTimelineEvents` interface in `schema-core.ts` updated
- [ ] `db:sync-types` + `db:sync-manifest` pass
- [ ] `db:schemas:check` green

## Related

- Timeline System epic (owns `world_timeline_events` table)
- Lore Knowledge epic (reads rarity for lore selection weighting)
