<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Inventory Specification

> **Status:** Partially implemented — per-actor/world item storage and transfer exist; the inventories abstraction (containers, capacity, permissions) is a design target (the earlier "Final" status overstated reality). Authoritative source is `src/` and AGENTS.md.

## Implemented

- `actor_items` table (per-actor items with `item_type` CHECK constraint) — interface in `src/db/schema-core.ts`, created in `src/db/migrations/001_init.ts` ~L840. (An earlier revision placed it in `schema-story.ts`; it is schema-core.)
- `world_items` instances carried by actors (`owner_actor_id`) or placed at locations (`location_id`) — `src/db/schema-story.ts`.
- Operations: `src/story/items/` — full/partial transfer (world-scoped), destroy, `getNpcInventory` / `getNpcInventoryBatch`.
- Equipment: equip state on items; durability degradation via `/api/battle/equipment/combat-use` (`src/routes/battle/equipment-durability.ts`).
- Currency: `actor_currencies` table (`src/db/migrations/001_init.ts` ~L817).

## Not implemented / aspirational

- `inventories` / inventory-slot tables; the container model (owner_type actor/location/storage/vehicle); weight/slot capacity + encumbrance; permissions/security; organization (sort/filter/group); cross-world inventory transfer rules; a dedicated inventory API (`src/inventory/` does not exist).

## Epics

- `.plan/epics/epic-inventory.md` (Draft)
- `.plan/epics/epic-inventory-ui.md`
- `.plan/epics/epic-item-system-extensions.md`
- `.plan/epics/epic-items-economy-crafting.md`
- `.plan/epics/epic-rpg-mechanics.md`
