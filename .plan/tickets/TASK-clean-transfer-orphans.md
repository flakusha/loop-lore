# TASK: Clean Up Item Transfer Orphans (Zero-Quantity Rows)

**Status:** ⬜ Not Started
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
  await db.updateTable("world_items")
    .set({
      quantity: 0,  // ← orphan!
      location_id: toLocationId ?? null,
      owner_actor_id: toActorId ?? null,
    })
    .where("id", worldItemId)
    .execute();
}
```

## Work

1. **Fix transfer logic** — when `remaining <= 0`, delete the source row instead of setting quantity to 0
2. **Add cleanup migration** — `033_cleanup_orphan_world_items.ts`:
   - Delete all `world_items` rows where `quantity <= 0`
   - Add CHECK constraint: `quantity > 0` (prevent future orphans)
3. **Update tests** — verify transfer deletes source row on full transfer
4. **Audit destroy()** — ensure `destroy()` also cleans up properly (it already deletes, but verify)

## Acceptance Criteria

- [ ] Full transfer deletes source `world_items` row (no quantity=0 orphans)
- [ ] Partial transfer still works (source row keeps remaining quantity)
- [ ] Migration removes all existing zero-quantity rows
- [ ] CHECK constraint `quantity > 0` enforced at DB level
- [ ] `bun test src/` green; `bun run check` green

## Files to Modify

- `src/story/items/instances.ts` — fix transfer to delete on full transfer
- `src/db/migrations/033_cleanup_orphan_world_items.ts` — cleanup + constraint
- `src/db/schema-story.ts` — add CHECK constraint to `world_items`

## Related

- `TASK-implement-trade.md` — trade uses transfer, must not create orphans
- `TASK-wire-crafting-routes.md` — crafting material consumption uses destroy/transfer
