<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Implement Item Transfer Event (ApplyItemTransfer)

**Status:** ✅ Complete (2026-08-12)
**Priority:** P2 — Medium
**Effort:** Small
**Epic:** epic-item-systems-unification
**Tags:** items, events, story, extraction, regex

## Summary

`story/events/application/handlers.ts:189-197` had `applyItemTransfer()` as a **no-op placeholder**. Fixed: emission was already present (extraction pops `item_transfer` events), but both it and the handler were broken — the emission always set `fromActorId: null` and omitted `locationId`, and the handler did nothing. Both now wired:

- **Emission fixed** (`extraction.ts`): drop/leave verbs set `fromActorId: actorId` (actor is the source); give/take verbs set `toActorId: actorId`; event carries `locationId: currentLocationId ?? undefined`.
- **Handler implemented** (`handlers.ts`): resolves `itemName` against `items` (case-insensitive `like`), finds source instance (owner actor, then location), calls `ItemsService.transfer()`. Unmatched names / missing sources → warning log, no crash.

## Acceptance Criteria

- [x] `extractEvents()` emits `item_transfer` events when narrative contains transfer verbs
- [x] `applyItemTransfer()` resolves item names to definitions and calls `ItemsService.transfer()`
- [x] Quest collection progress fires on item transfer events (collection.ts already keys on `item_transfer` / `WorldEventType.ItemTransfer`)
- [x] Unmatched item names logged as warnings (no crash)
- [x] `bun test src/` green; `bun run check` green

## Notes (impl 2026-08-12)

- `applyItemTransfer` signature now takes `(db, itemsService, worldId, event)` — dispatch passes `database`.
- 4 new handler tests (`handlers.test.ts`) + 4 extraction tests (`extraction.test.ts`); full suite 3444 pass / 0 fail; typecheck clean.

## Related

- `TASK-link-npc-inventory.md` — transfer affects NPC inventory
- `TASK-implement-trade.md` — trade is a structured transfer
- `epic-quests-encounters.md` — quests track item transfers
