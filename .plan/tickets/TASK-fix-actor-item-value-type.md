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

1. **Migration** — `034_fix_actor_item_value_type.ts`:
   - Cast existing text values to integer (handle NULL, empty string, non-numeric gracefully)
   - Alter column type from `text` to `integer`
   - Set default to 0
2. **Update schema** — `schema-core.ts` `ActorItems.value` → `Generated<number>`
3. **Update routes** — `actor-items.ts` field mapping already maps `value` → `value`, no change needed
4. **Update validation** — `db-schemas.ts` ensure `value` is numeric

## Acceptance Criteria

- [ ] `actor_items.value` column is integer type
- [ ] Existing data migrated (non-numeric → 0 or NULL)
- [ ] `ActorItems.value` type is `number` in schema
- [ ] `bun test src/` green; `bun run check` green

## Files to Modify

- `src/db/schema-core.ts` — `ActorItems.value` type
- `src/db/migrations/034_fix_actor_item_value_type.ts` — new migration
- `src/db/column-types.ts` — update type mapping
- `src/validation/db-schemas.ts` — update validation schema

## Related

- `TASK-actor-item-service.md` — service uses value for trade/weight calculations
- `TASK-implement-trade.md` — trade needs numeric values
