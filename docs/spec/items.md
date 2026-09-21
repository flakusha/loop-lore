<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Items Specification

> **Status:** Substantially implemented (definitions, instances, rarity, loot, equipment durability); state machines, effects, and economics are design targets (the earlier "Final" status overstated reality). Authoritative source is `src/` and AGENTS.md.

## Implemented

- Tables: `items` (definitions: category, rarity, stackable, max_stack, properties, value, weight) and `world_items` (instances: location_id, owner_actor_id, quantity, visibility) — `src/db/schema-story.ts`.
- Service: `src/story/items/` — definitions, instances (full/partial transfer, destroy), NPC inventory batch reads.
- Loot: `src/rpg/loot/` — rarity × level weighted generation persisted to `world_items`; loot `Rarity` unified with the canonical `ItemRarity` enum; drop weights in `src/rpg/loot/weights.ts` (`RARITY_WEIGHTS`).
- Battle equipment: `/api/battle/equipment/*` including durability degradation persisted to `actor_items` (`src/routes/battle/equipment-durability.ts`).
- `actor_items` category CHECK (`src/db/migrations/001_init.ts` ~L857): weapon, armor, consumable, key_item, quest_item, material, tool, container, treasure, book, artifact, misc, other.

## Not implemented / aspirational

- Item use/consume/collect state machines and history log; passive/active effects and set bonuses; value/price-factor economics; the §6 `world_items` ALTER columns (durability, charges, states) as spec'd.

## Unique content (compressed)

- Rarity tiers: common, uncommon, rare, epic, legendary, artifact.
- Full taxonomy (superset of the DB CHECK) adds Usable (charged), Currency, Lore, Trinket, Mount, Companion.

## Epics

- `.plan/epics/epic-items.md` (Draft)
- `.plan/epics/epic-item-systems-unification.md`
- `.plan/epics/epic-item-system-extensions.md`
- `.plan/epics/epic-items-economy-crafting.md` (Not Started)
- `.plan/epics/epic-rarity-extensions.md`
- `.plan/epics/epic-rpg-mechanics.md`
