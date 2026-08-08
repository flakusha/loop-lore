# TASK: Implement Item Transfer Event (ApplyItemTransfer)

**Status:** ⬜ Not Started
**Priority:** P2 — Medium
**Effort:** Small
**Epic:** epic-item-systems-unification
**Tags:** items, events, story, extraction, regex

## Summary

`story/events/application/handlers.ts:189-197` has `applyItemTransfer()` as a **no-op placeholder** — it logs nothing and does nothing. Meanwhile `story/events/extraction.ts:43-47` has regex patterns that detect "gives/hands/offers/trades/takes/drops" in narrative text. The extraction never emits `item_transfer` events, and even if it did, the handler ignores them.

## Current State

```typescript
// handlers.ts:189-197
export async function applyItemTransfer(
  _itemsService: ItemsService,
  _worldId: string,
  _event: WorldEvent,
): Promise<void> {
  // For v1: just log the transfer. Actual item resolution requires
  // matching item names to definitions, which needs LLM-assisted matching.
  // This placeholder ensures the event is recorded without error.
}
```

## Work

1. **Emit item_transfer events** — in `extraction.ts`, when item patterns match, emit `{ type: "item_transfer", data: { itemName, fromActorId, toActorId } }`
2. **Implement `applyItemTransfer()`**:
   - Match `event.data.itemName` to `items` table (fuzzy name match or exact)
   - Find source: `world_items` owned by `fromActorId` matching item
   - Find/create destination: `toActorId` or location
   - Call `ItemsService.transfer(worldItemId, quantity, toLocationId, toActorId)`
3. **Quest integration** — `story/quests/calculators/collection.ts` already checks for `item_transfer` events — verify it fires correctly
4. **Fallback for unmatched items** — if item name doesn't match any definition, log warning (don't crash)

## Acceptance Criteria

- [ ] `extractEvents()` emits `item_transfer` events when narrative contains transfer verbs
- [ ] `applyItemTransfer()` resolves item names to definitions and calls `ItemsService.transfer()`
- [ ] Quest collection progress fires on item transfer events
- [ ] Unmatched item names logged as warnings (no crash)
- [ ] `bun test src/` green; `bun run check` green

## Files to Modify

- `src/story/events/extraction.ts` — emit `item_transfer` events
- `src/story/events/application/handlers.ts` — implement `applyItemTransfer()`
- `src/story/quests/calculators/collection.ts` — verify integration

## Related

- `TASK-link-npc-inventory.md` — transfer affects NPC inventory
- `TASK-implement-trade.md` — trade is a structured transfer
- `epic-quests-encounters.md` — quests track item transfers
