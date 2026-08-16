<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Fix Actor Items Value Type (text → integer)

**Status:** ✅ Complete (2026-08-12)
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

- [x] `actor_items.value` column is integer type (inline in `parts/005_actor_data.ts`)
- [x] `ActorItems.value` type is `number` in schema
- [x] `bun test src/` green; `bun run check` green

## Notes (impl 2026-08-12)

- `005_actor_data.ts`: `value` `text` → `integer notNull default 0` (DB reinit — no backfill needed).
- Regenerated `schema-core.ts` (`Generator<number>`), `insert-helpers.ts` (`value?: Generated<number>`), `validation/db-schemas.ts` (`value: t.Optional(t.Number()) -> notNull default`).
- `ActorItemsService` transfer copies `size` correctly typed; no string assumptions found.
- Verified: db schemas gate green, full suite 3414 pass / 0 fail, typecheck + frontend + coverage (96.90%) pass.

## Files to Modify

- `src/db/schema-core.ts` — `ActorItems.value` type
- `src/db/migrations/parts/005_actor_data.ts` — change `value` column to integer (inline, reinit)
- `src/db/column-types.ts` — update type mapping
- `src/validation/db-schemas.ts` — update validation schema

## Related

- `TASK-actor-item-service.md` — service uses value for trade/weight calculations
- `TASK-implement-trade.md` — trade needs numeric values
