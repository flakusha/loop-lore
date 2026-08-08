# TASK: Item Edit Permissions & History (Audit Trail)

**Status:** ⬜ Not Started
**Priority:** P2 — Medium
**Effort:** Small
**Epic:** epic-item-systems-unification
**Tags:** items, permissions, audit, history, provenance

## Summary

No task addresses **who can edit items** or **item history/provenance**. Currently any world owner can edit any item, and there's no record of where an item has been. This task adds edit permission rules and a basic audit trail for item lifecycle events.

## Current State

- `routes/story-items/definitions.ts` — any world owner can edit/delete any item
- No `created_by` or `updated_by` tracking on `items` table
- No history of: item created → placed → transferred → traded → destroyed
- `TASK-item-system-extensions.md` mentions `history = ["Forged in Dragonfire", "Broke during siege"]` but it's not implemented

## Work

1. **Edit permissions** — extend item definition:
   - `created_by` column (user who created the item)
   - Edit restrictions: only creator or GM can edit (configurable per world)
   - Lock items from editing (GM can lock an item definition)
2. **Item history/audit table** — `item_history` table:
   - `id, item_id, world_id, event_type, actor_id, timestamp, details`
   - Events: created, placed, transferred, equipped, unequipped, traded, destroyed
   - Populated by `ItemsService` methods (transfer, place, destroy, etc.)
3. **History UI** — in item details panel:
   - "History" tab showing chronological item provenance
   - "Created by X → placed at Y → carried by Z → traded to W"
   - Visual timeline component
4. **Provenance badge** — on item cards:
   - "Legendary: Forged by dragonfire, carried by 3 heroes"
   - Adds immersion and item identity

## Acceptance Criteria

- [ ] `items` table has `created_by` column
- [ ] Edit restrictions enforced (creator/GM only, configurable)
- [ ] `item_history` table records all item lifecycle events
- [ ] History viewable in item details panel as timeline
- [ ] Provenance badge on item cards (optional, from history)
- [ ] `bun test src/` green; `bun run check` green

## Files to Create

- `src/services/item-history.ts` — ItemHistoryService (record/query events)
- `src/components/world/item-history-timeline.html` — timeline partial

## Files to Modify

- `src/db/migrations/parts/003_worlds.ts` — add `created_by` to `items` + `item_history` table (inline, reinit) — no new migration file
- `src/story/items/index.ts` — record history events in transfer/place/destroy
- `src/routes/story-items/definitions.ts` — enforce edit permissions
- `src/frontend/alpine/world-items.ts` — add history tab to item detail

## Related

- `TASK-implement-item-transfer-event.md` — item transfer events feed history
- `TASK-implement-trade.md` — trade events feed history
- `TASK-wire-crafting-routes.md` — crafting creates items (history: "crafted by X")
- `epic-item-system-extensions.md` — item history tracking spec
