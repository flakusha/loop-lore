<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Inventory System (Hub)

**Overview:** (see sections below)

**Status:** Not Started
**Priority:** High
**Effort:** High
**Type:** Feature Epic (hub)
**Tags:** inventory, items, ownership, transfer, trading

## Summary

Hub epic for the full inventory stack: item definitions, per-actor instances
with ownership, ownership transfer, and trading. Implementation is split
across member epics; this file owns the shared model, sequencing, and
cross-cutting acceptance criteria.

> **Note:** The sub-epic name 'Trading & Inventory' cited by
> `epic-items-economy-crafting.md` (line 45), `epic-rpg-mechanics.md` (line 38),
> and `epic-battle-action-systems.md` (line 31) has no corresponding epic file -
> the file was never created. Trading backend coverage lives in
> `epic-item-systems-unification.md` (`TASK-implement-trade.md`, Done),
> `epic-economy-trading.md`, and `TASK-trade-history-npc-counterparty.md`.
> Those three citations are stale pointers, not member links.

## Scope

| Layer | Owns | Lives in |
| ----- | ---- | -------- |
| Definitions | item definitions / stats / categories / rarity | `epic-items.md`, `epic-items-economy-crafting.md` |
| Instances | per-actor `actor_items` rows, world `world_items` rows | `epic-item-systems-unification.md`, this hub |
| Ownership | `requireActorOwnership` guard on CRUD ops (`src/actors/actor-items.ts`); transfer enforced at route via `actorOwnerCheck` (`src/routes/actor-items/service.ts`) | `src/actors/access.ts`, `src/actors/actor-items.ts` |
| Transfer | actor-to-actor `transferItems`, world-instance `transfer` | `src/services/actor-items/transfer.ts`, `src/story/items/instances.ts` |
| Trading | offer/accept lifecycle, currency ledger, NPC counterparty | `epic-economy-trading.md`, `TASK-implement-trade.md`, `TASK-trade-history-npc-counterparty.md` |

## Related (member epics)

- `epic-items.md` — item types, properties, loot tables, lifecycle
- `epic-inventory-ui.md` — inventory + trading UI (depends on this hub's backend)
- `epic-inventory.md` — inventory storage / equipment-slot spec stub (active work tracked in `epic-item-systems-unification.md`)
- `epic-item-systems-unification.md` — unified types, trade service, actor item service
- `epic-economy-trading.md` — currency, market, auction, banking

## Shared Model

- `actor_items` table (`src/db/migrations/001_init.ts`, `ck_actor_items_type` CHECK): per-actor instances, `equipped` flag, unified `ItemCategory`/`ItemRarity`
- CRUD + ownership: `src/actors/actor-items.ts` (`requireActorOwnership` per op), routes `src/routes/actor-items.ts` (`tableName: "actor_items"`)
- Actor-to-actor transfer: `transferItems` (`src/services/actor-items/transfer.ts`)
- World-instance transfer: `transfer` (`src/story/items/instances.ts`), route `POST .../item-instances/:instanceId/transfer` (`src/routes/story-items/instances.ts:114`)

## Acceptance Criteria

- [ ] `actor_items` CRUD (create/read/update/delete + actor-scoped list) enforces `requireActorOwnership`; strangers get 403, missing rows 404. The guard exists in `src/actors/actor-items.ts` (5 call sites) but `TASK-actor-items-crud-ownership.md` is still Not Started, so the 403/404 contract is not pinned by tests.
- [ ] Ownership transfer is atomic on the actor side: actor-to-actor `transferItems` runs source-deduct + target-grant in a single transaction leaving no orphans on partial failure. World-instance `transfer` (`src/story/items/instances.ts`) is NOT transaction-wrapped at HEAD (uses `trx ?? state.db`, and `handleTransfer` passes no `trx`) — world-side atomicity is out of scope until that path is wrapped in `db.transaction()`.
- [ ] Trade offer/accept/cancel lifecycle settles through the transfer primitives (no parallel transfer path)
- [ ] Equipped items feed loadout/battle consumers via the `equipped` flag (`src/characters/services/wardrobe/loadout-bridge.ts`, `src/routes/battle/equipment-durability.ts`)
- [ ] `TASK-actor-items-crud-ownership.md`, `TASK-actor-item-service.md` (done), `TASK-implement-trade.md` (done), `TASK-actors-child-tables-crud.md`, `TASK-actors-api-routes.md` linked as implementers

## Dependencies

- `epic-item-systems-unification.md` — unified taxonomy, transfer, and trade
  primitives (In Progress)
- `src/story/items/` — `ItemsService`, the canonical item lifecycle
- `src/actors/access.ts` — ownership primitives

## Unticketed Gaps

- World-instance transfer atomicity: `src/story/items/instances.ts` deducts from
  the source `world_items` row before granting to the destination, with no
  transaction wrapper and no `trx` supplied by `handleTransfer`. A failed grant
  destroys the items. No ticket covers this.
- `TASK-actors-child-tables-crud.md` and `TASK-actors-api-routes.md` have no
  status in `.plan/tickets/index.json` — they are referenced here as
  implementers but are untracked.

## Linked Tasks

- `TASK-actor-items-crud-ownership.md` (Not Started)
- `TASK-actor-item-service.md` (Done)
- `TASK-implement-trade.md` (Done)
- `TASK-trade-history-npc-counterparty.md` (open)
- `TASK-actors-child-tables-crud.md` (no index entry)
- `TASK-actors-api-routes.md` (no index entry)
