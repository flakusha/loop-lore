# TASK: Fix Actor Items Value Type (text → integer)

**Status:** ⬜ Not Started
**Priority:** P3 — Low
**Effort:** Small
**Epic:** epic-item-systems-unification
**Tags:** items, schema, migration, data-integrity

## Summary

`actor_items.value` is `text` while `items.value` is `integer`. This inconsistency prevents numeric comparisons, sorting, and arithmetic on actor item values. Fix the column type and migrate existing data.

## Current State

```typescript
// schema-core.ts:203
export interface ActorItems {
  value: string | null;  // ← should be number
  ...
}

// schema-story.ts:72
export interface Items {
  value: Generated<number>;  // ← correct
  ...
}
```

## Work

1. **Schema (inline, no new migration)** — DB is reinit, so no data cast needed. Edit `actor_items.value` in `parts/005_actor_data.ts`:
   - Change column type from `text` to `integer` (default 0, nullable)
   - No backfill/cast required (fresh DB)
2. **Update schema** — `schema-core.ts` `ActorItems.value` → `Generated<number>`
3. **Update routes** — `actor-items.ts` field mapping already maps `value` → `value`, no change needed
4. **Update validation** — `db-schemas.ts` ensure `value` is numeric

## Acceptance Criteria

- [ ] `actor_items.value` column is integer type (inline in `parts/005_actor_data.ts`)
- [ ] `ActorItems.value` type is `number` in schema
- [ ] `bun test src/` green; `bun run check` green

## Files to Modify

- `src/db/schema-core.ts` — `ActorItems.value` type
- `src/db/migrations/parts/005_actor_data.ts` — change `value` column to integer (inline, reinit)
- `src/db/column-types.ts` — update type mapping
- `src/validation/db-schemas.ts` — update validation schema

## Related

- `TASK-actor-item-service.md` — service uses value for trade/weight calculations
- `TASK-implement-trade.md` — trade needs numeric values
