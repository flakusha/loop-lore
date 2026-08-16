<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Item Systems Unification & Gap Closure

**Status:** 🟡 In Progress (backend wiring merged 2026-08-14 — `rpg-wire-routes`; item frontend/UX tickets remain)
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** items, inventory, trade, crafting, loot, npc, economy, unification

## Summary

Unify the fragmented item systems and close critical gaps identified in the RPG mechanics review (2026-08-09). Currently there are **4 parallel item type taxonomies**, **2 separate loot systems**, **denormalized NPC inventory**, **no trade/economy**, **crafting unreachable** (8 tables, 0 routes), and **item transfer orphans**. This epic consolidates these into a coherent item lifecycle: **create → provision → allocate → trade → equip → loot → craft → destroy**.

## Current State Assessment

| System                   | DB Tables                     | Service                       | Routes                  | Frontend            | Status              |
| ------------------------ | ----------------------------- | ----------------------------- | ----------------------- | ------------------- | ------------------- |
| Item definitions (world) | `items`                       | ✅ `ItemsService`             | ✅ `story-items`        | ✅ `world-items.ts` | Functional          |
| World item instances     | `world_items`                 | ✅ `ItemsService`             | ✅ `story-items`        | ✅ `world-items.ts` | Functional, orphans |
| Actor/NPC inventory      | `actor_items`                 | ❌ none (generic factory)     | ✅ `actor-items` (CRUD) | ❌ none             | No equip logic      |
| NPC runtime inventory    | `npc_states.inventory` (JSON) | ❌ none                       | ❌ none                 | ❌ none             | Denormalized        |
| Loot tables              | —                             | ✅ `rpg/loot`                 | ❌ none                 | ❌ none             | Not persisted       |
| Battle equipment         | —                             | ✅ `battle/items-integration` | ✅ `battle/equipment`   | ❌ none             | Siloed type system  |
| Crafting                 | 8 tables                      | ✅ `rpg/crafting/recipes`     | ❌ none                 | ❌ none             | Unreachable         |
| Trade/Economy            | `crafting_orders`             | ❌ none                       | ❌ none                 | ❌ none             | Not implemented     |

## Key Issues (from Review)

### 🔴 Critical

| # | Issue                                                                                                             | Impact                                   |
| - | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1 | **4 item type taxonomies** — `ItemCategory` (11), `ActorItemType` (5), `ItemQuality` (5), `Rarity` (5 vs 6 tiers) | No interoperability between systems      |
| 2 | **NPC inventory denormalized** — `npc_states.inventory` is JSON string array, not linked to `world_items`         | GM sees names but can't resolve to items |
| 3 | **No trade/economy** — `crafting_orders` unused, transfer is move-not-trade, no currency                          | No player-driven economy                 |
| 4 | **Crafting unreachable** — 8 tables + service exist, 0 HTTP routes                                                | Dead code                                |

### 🟡 High

| # | Issue                                                                                        | Impact                                 |
| - | -------------------------------------------------------------------------------------------- | -------------------------------------- |
| 5 | **Loot not persisted** — `generateLoot()` returns anonymous drops, no `world_items` creation | Loot drops vanish                      |
| 6 | **Item transfer leaves orphans** — `quantity: 0` rows never cleaned up                       | DB bloat                               |
| 7 | **Event extraction no-op** — `applyItemTransfer()` is placeholder                            | Story events never fire item transfers |
| 8 | **Actor items lack service** — raw generic CRUD, no equip logic, no weight limit             | No gameplay depth                      |
| 9 | **Battle `EquipmentItem` siloed** — separate type system, no mapping to world items          | Can't equip world items in battle      |

### 🟠 Medium

| #  | Issue                                                                             | Impact             |
| -- | --------------------------------------------------------------------------------- | ------------------ |
| 10 | **`value` type mismatch** — `actor_items.value` is text, `items.value` is integer | Data inconsistency |

## Sub-Tasks

| Task                                    | Scope                                                           | Priority |
| --------------------------------------- | --------------------------------------------------------------- | -------- |
| ✅ `TASK-unify-item-types.md`            | Single `ItemDefinition` taxonomy, map all variants              | P0       |
| ✅ `TASK-link-npc-inventory.md`          | Replace JSON array with `world_items.owner_actor_id` references | P0       |
| ✅ `TASK-wire-crafting-routes.md`        | Expose `RecipesService` via HTTP (recipe CRUD done; stations/attempts/orders deferred — see below) | P1 |
| ✅ `TASK-persist-loot-drops.md`          | `generateLoot()` → `placeInLocation()` / `giveToNpc()`          | P1       |
| ✅ `TASK-implement-trade.md`             | Currency ledger + atomic two-sided trade (offer/accept lifecycle + NPC trading deferred — see below) | P1 |
| ⬜ `TASK-item-provisioning-dashboard.md` | World-level allocation view (all items → where allocated)       | P1       |
| ⬜ `TASK-npc-inventory-frontend.md`      | View NPC inventories + trade with NPCs                          | P1       |
| ⬜ `TASK-equipment-stat-preview.md`      | Live stat delta preview when equipping/unequipping              | P1       |
| ✅ `TASK-clean-transfer-orphans.md`      | Delete `world_items` rows where `quantity <= 0`                 | P2       |
| ✅ `TASK-implement-item-transfer-event.md` | Resolve `applyItemTransfer()` → `ItemsService.transfer()`     | P2       |
| ✅ `TASK-actor-item-service.md`          | Dedicated service: equip/unequip, weight limit, trade           | P2       |
| ✅ `TASK-map-battle-equipment.md`        | Map `EquipmentItem` → `ItemDefinition`, shared enum             | P2       |
| ⬜ `TASK-item-generation.md`             | Procedural + LLM-assisted item generation                       | P2       |
| ⬜ `TASK-item-edit-permissions-history.md` | Edit permissions + item provenance audit trail                | P2       |
| ✅ `TASK-fix-actor-item-value-type.md`   | `actor_items.value` text → integer                              | P3       |

## Remaining Points (deferred from completed backend tasks)

The following were explicitly deferred while wiring the backend and remain
as follow-up work (not yet ticketed as standalone tasks):

| # | Point | Where it was deferred | Notes |
|---|-------|----------------------|-------|
| 1 | Crafting station defin/instance CRUD + `GET stations` route | `TASK-wire-crafting-routes` | Requires `StationsService` (see `TASK-complete-crafting-system-services`) |
| 2 | Crafting attempt execution (consume materials → produce output, success/skill/level checks) + `POST /craft` route | `TASK-wire-crafting-routes` | Requires `CraftingProcessService` |
| 3 | Crafting orders placed/fulfilled via HTTP (+ payment) | `TASK-wire-crafting-routes`, `TASK-implement-trade` | `crafting_orders` table exists; TradeService is the payment primitive |
| 4 | Trade offer/accept/cancel lifecycle (persistent pending exchanges) | `TASK-implement-trade` | Only synchronous `POST /trade/execute` exists |
| 5 | NPC trading (sell to NPC, buy from NPC inventory) | `TASK-implement-trade`, `TASK-npc-inventory-frontend` | TradeService supports any actor owner; needs a counterparty wrapper |
| 6 | Trade history queryable | `TASK-implement-trade` | No history table yet |

## Implementation Approach

### Migration policy (this epic)

**No new migration files.** DB is reinit, so schema changes are **inlined into the existing
migration that first creates the affected table**. Backfills/data-casts are unnecessary.

| Target table                      | Inline home (existing migration) |
| --------------------------------- | -------------------------------- |
| `items`, `locations`, `worlds`    | `parts/003_worlds.ts`            |
| `actors`, `world_items`           | `parts/004_chats_actors.ts`      |
| `actor_items`, `actor_currencies` | `parts/005_actor_data.ts`        |
| `npc_states`                      | `parts/007_story_generation.ts`  |
| `crafting_*`                      | `011_crafting_professions.ts`    |
| `character_skills`                | `036_character_skills.ts`        |

Affected schema edits: `items` category/rarity CHECK (unify), `world_items` `CHECK(quantity>0)`
(clean-orphans), `actor_items.value` → integer (fix-value-type), `actor_items.item_type` CHECK
(unify), keep-but-deprecate `npc_states.inventory` (link-npc-inventory), `actor_currencies`
table (trade).

Generate-after edits: `bun run db:sync-types && bun run db:sync-manifest`, verify
`bun run db:schemas:check`.

## Implementation Order (dependency-first)

1. `TASK-unify-item-types` — foundational enum consolidation (everything depends on it)
2. `TASK-fix-actor-item-value-type` — small schema fix
3. `TASK-clean-transfer-orphans` — transfer correctness (trade/event depend on it)
4. `TASK-implement-item-transfer-event` — event handler → real transfer
5. `TASK-persist-loot-drops` — loot → world_items (uses transfer/place)
6. `TASK-wire-crafting-routes` — expose RecipesService (material consumption uses transfer)
7. `TASK-implement-trade` — currency + trade (needs clean transfer + unified types)
8. `TASK-actor-item-service` — equip/weight (needs unified types + numeric value)
9. `TASK-map-battle-equipment` — battle → world defs (needs unified types)
10. Frontend/epic-P1 tickets (provisioning dashboard, NPC inventory UI, equipment preview) — build on backend above

Cross-feature note: the same inline-migration policy applies to related epics touching the same
tables (`epic-skills` → `036_character_skills.ts`; `epic-crafting-professions` → `011`; economy
tables → `005_actor_data.ts`). No serialized new migrations here.

## Acceptance Criteria

- [x] Single item type taxonomy (`ItemCategory` + `ItemRarity`) used across all systems
- [x] NPC inventory resolved via `world_items.owner_actor_id` (no denormalized JSON)
- [x] Crafting recipes accessible via HTTP routes (recipe CRUD)
- [ ] Crafting stations and orders accessible via HTTP routes (deferred — §Remaining Points #1–3; needs `StationsService`/`CraftingProcessService`)
- [x] Loot generation persists items as `world_items` instances
- [x] Trade endpoint: transfer items + currency between actors (synchronous `POST /trade/execute`)
- [x] No orphaned `world_items` rows (quantity > 0 CHECK + delete-on-full-transfer)
- [x] Story event item transfers resolve to actual `ItemsService.transfer()` calls
- [x] Actor items have equip/unequip with weight limits (stat-effect application deferred — `TASK-actor-item-service.md`)
- [x] Battle equipment maps to world item definitions
- [ ] **Frontend**: World item provisioning dashboard (allocate items to locations/NPCs)
- [ ] **Frontend**: NPC inventory view + trading interface
- [ ] **Frontend**: Equipment stat delta preview (live feedback on equip/unequip)
- [ ] **Frontend**: Item generation UI (procedural + LLM-assisted)
- [ ] **Frontend**: Item history/provenance timeline
- [x] `bun run check` green; all new code covered by tests (typecheck/coverage/db-schema green; size-strict fixed)

## Related Epics

- `epic-items.md` — aspirational item spec (this epic makes it real)
- `epic-inventory.md` — aspirational inventory spec
- `epic-inventory-ui.md` — inventory/trading UI (depends on this epic's backend)
- `epic-item-system-extensions.md` — durability, effects (builds on this)
- `epic-crafting-professions.md` — crafting DB layer (this epic wires the routes)
- `epic-battle-integration-gaps.md` — battle-items integration
- `epic-economy-trading.md` — economy spec (this epic implements core)

## Files Referenced

- `src/story/items/index.ts` — ItemsService
- `src/story/items/instances.ts` — placement/transfer/destroy
- `src/story/items/definitions.ts` — CRUD dispatchers
- `src/story/items/types.ts` — ItemDefinition, ItemInstance, TransferResult
- `src/routes/story-items/` — HTTP routes for definitions + instances
- `src/routes/actor-items.ts` — generic CRUD factory for actor_items
- `src/db/enums-story/items.ts` — ItemCategory, ItemRarity, ItemVisibility
- `src/db/enums-core/flags.ts` — ActorItemType, EquipState
- `src/rpg/loot/` — loot generation (not persisted)
- `src/battle/items-integration.ts` — EquipmentItem (siloed)
- `src/rpg/crafting/recipes/` — RecipesService (no routes)
- `src/db/schema-crafting.ts` — 8 crafting tables
- `src/story/events/application/handlers.ts:189` — applyItemTransfer placeholder
- `src/story/world-state/context.ts:117` — NPC inventory JSON parse
- `src/db/schema-core.ts:195-211` — actor_items table
- `src/db/schema-story.ts:62-76` — items table
- `src/db/schema-story.ts:102-115` — world_items table
- `src/db/schema-story.ts:237-251` — npc_states table
