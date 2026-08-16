<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Clean Up Item Transfer Orphans (Zero-Quantity Rows)

**Status:** ✅ Complete (2026-08-12)
**Priority:** P2 — Medium
**Effort:** Small
**Epic:** epic-item-systems-unification
**Tags:** items, cleanup, maintenance, data-integrity

## Summary

`ItemsService.transfer()` sets `world_items.quantity = 0` on the source row when fully transferred instead of deleting it. Over time this accumulates orphaned zero-quantity rows that waste space and confuse queries.

## Current Behavior

```typescript
// story/items/instances.ts:139-146
if (remaining <= 0) {
  // Transfer all — update row with new owner
  await db.updateTable("world_items",)
    .set({
      quantity: 0, // ← orphan!
      location_id: toLocationId ?? null,
      owner_actor_id: toActorId ?? null,
    },)
    .where("id", worldItemId,)
    .execute();
}
```

## Work

1. **Fix transfer logic** — when `remaining <= 0`, delete the source row instead of setting quantity to 0
2. **Add CHECK constraint (inline, no new migration)** — DB is reinit, so no cleanup migration needed. Add `CHECK (quantity > 0)` to `world_items` in `parts/004_chats_actors.ts` to prevent future orphans
3. **Update tests** — verify transfer deletes source row on full transfer
4. **Audit destroy()** — ensure `destroy()` also cleans up properly (it already deletes, but verify)

## Acceptance Criteria

- [x] Full transfer deletes source `world_items` row (no quantity=0 orphans)
- [x] Partial transfer still works (source row keeps remaining quantity)
- [x] CHECK constraint `quantity > 0` enforced at DB level (inline in `parts/004_chats_actors.ts`)
- [x] `bun test src/` green; `bun run check` green

## Notes (impl 2026-08-12)

- `transfer()` full-transfer branch now `deleteFrom` source instead of `quantity: 0`.
- Added `ck_world_items_quantity` CHECK (`quantity > 0`) to `world_items` in `004_chats_actors.ts`; regenerated `schema-manifest.ts`.
- Audited `destroy()` — already deletes on full/undefined, reduces on partial (no orphans).
- No other code writes zero-quantity to `world_items`. Verified via grep.
- 6 new `instances.test.ts` tests (full/partial transfer + destroy paths); full suite 3436 pass / 0 fail (3 stable runs); typecheck + frontend + coverage (96.91%) pass.

## Files to Modify

- `src/story/items/instances.ts` — fix transfer to delete on full transfer
- `src/db/migrations/parts/004_chats_actors.ts` — add `CHECK (quantity > 0)` to `world_items` (inline)
- `src/db/schema-story.ts` — reflect CHECK constraint on `world_items` (regenerated)

## Related

- `TASK-implement-trade.md` — trade uses transfer, must not create orphans
- `TASK-wire-crafting-routes.md` — crafting material consumption uses destroy/transfer
