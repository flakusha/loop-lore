# EPIC: Item Systems Unification & Gap Closure

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** items, inventory, trade, crafting, loot, npc, economy, unification

## Summary

Unify the fragmented item systems and close critical gaps identified in the RPG mechanics review (2026-08-09). Currently there are **4 parallel item type taxonomies**, **2 separate loot systems**, **denormalized NPC inventory**, **no trade/economy**, **crafting unreachable** (8 tables, 0 routes), and **item transfer orphans**. This epic consolidates these into a coherent item lifecycle: **create → provision → allocate → trade → equip → loot → craft → destroy**.

## Current State Assessment

| System | DB Tables | Service | Routes | Frontend | Status |
|--------|-----------|---------|--------|----------|--------|
| Item definitions (world) | `items` | ✅ `ItemsService` | ✅ `story-items` | ✅ `world-items.ts` | Functional |
| World item instances | `world_items` | ✅ `ItemsService` | ✅ `story-items` | ✅ `world-items.ts` | Functional, orphans |
| Actor/NPC inventory | `actor_items` | ❌ none (generic factory) | ✅ `actor-items` (CRUD) | ❌ none | No equip logic |
| NPC runtime inventory | `npc_states.inventory` (JSON) | ❌ none | ❌ none | ❌ none | Denormalized |
| Loot tables | — | ✅ `rpg/loot` | ❌ none | ❌ none | Not persisted |
| Battle equipment | — | ✅ `battle/items-integration` | ✅ `battle/equipment` | ❌ none | Siloed type system |
| Crafting | 8 tables | ✅ `rpg/crafting/recipes` | ❌ none | ❌ none | Unreachable |
| Trade/Economy | `crafting_orders` | ❌ none | ❌ none | ❌ none | Not implemented |

## Key Issues (from Review)

### 🔴 Critical

| # | Issue | Impact |
|---|-------|--------|
| 1 | **4 item type taxonomies** — `ItemCategory` (11), `ActorItemType` (5), `ItemQuality` (5), `Rarity` (5 vs 6 tiers) | No interoperability between systems |
| 2 | **NPC inventory denormalized** — `npc_states.inventory` is JSON string array, not linked to `world_items` | GM sees names but can't resolve to items |
| 3 | **No trade/economy** — `crafting_orders` unused, transfer is move-not-trade, no currency | No player-driven economy |
| 4 | **Crafting unreachable** — 8 tables + service exist, 0 HTTP routes | Dead code |

### 🟡 High

| # | Issue | Impact |
|---|-------|--------|
| 5 | **Loot not persisted** — `generateLoot()` returns anonymous drops, no `world_items` creation | Loot drops vanish |
| 6 | **Item transfer leaves orphans** — `quantity: 0` rows never cleaned up | DB bloat |
| 7 | **Event extraction no-op** — `applyItemTransfer()` is placeholder | Story events never fire item transfers |
| 8 | **Actor items lack service** — raw generic CRUD, no equip logic, no weight limit | No gameplay depth |
| 9 | **Battle `EquipmentItem` siloed** — separate type system, no mapping to world items | Can't equip world items in battle |

### 🟠 Medium

| # | Issue | Impact |
|---|-------|--------|
| 10 | **`value` type mismatch** — `actor_items.value` is text, `items.value` is integer | Data inconsistency |

## Sub-Tasks

| Task | Scope | Priority |
|------|-------|----------|
| `TASK-unify-item-types.md` | Single `ItemDefinition` taxonomy, map all variants | P0 |
| `TASK-link-npc-inventory.md` | Replace JSON array with `world_items.owner_actor_id` references | P0 |
| `TASK-wire-crafting-routes.md` | Expose `RecipesService` via HTTP, connect material consumption | P1 |
| `TASK-persist-loot-drops.md` | `generateLoot()` → `placeInLocation()` / `giveToNpc()` | P1 |
| `TASK-implement-trade.md` | Transfer with currency, `crafting_orders` as economy backbone | P1 |
| `TASK-clean-transfer-orphans.md` | Delete `world_items` rows where `quantity <= 0` | P2 |
| `TASK-implement-item-transfer-event.md` | Resolve `applyItemTransfer()` → `ItemsService.transfer()` | P2 |
| `TASK-actor-item-service.md` | Dedicated service: equip/unequip, weight limit, trade | P2 |
| `TASK-map-battle-equipment.md` | Map `EquipmentItem` → `ItemDefinition`, shared enum | P2 |
| `TASK-fix-actor-item-value-type.md` | `actor_items.value` text → integer | P3 |

## Acceptance Criteria

- [ ] Single item type taxonomy (`ItemCategory` + `ItemRarity`) used across all systems
- [ ] NPC inventory resolved via `world_items.owner_actor_id` (no denormalized JSON)
- [ ] Crafting recipes, stations, and orders accessible via HTTP routes
- ] Loot generation persists items as `world_items` instances
- [ ] Trade endpoint: transfer items + currency between actors
- [ ] No orphaned `world_items` rows (quantity > 0 constraint or cleanup)
- [ ] Story event item transfers resolve to actual `ItemsService.transfer()` calls
- [ ] Actor items have equip/unequip with stat effects and weight limits
- [ ] Battle equipment maps to world item definitions
- [ ] `bun run check` green; all new code covered by tests

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
