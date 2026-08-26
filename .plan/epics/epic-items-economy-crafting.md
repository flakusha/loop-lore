<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: RPG Items, Economy & Crafting

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Very High
**Type:** Feature Epic
**Tags:** rpg, items, economy, money, crafting, unique-items
**Parent Epic:** RPG Mechanics & Extensible Game Systems (epic-rpg-mechanics.md)

## Summary

Item definitions and gameplay stats, item economics and currency, unique items with special properties, and the crafting system. RPG owns item **definitions/stats** only — inventory management UI and trading flows are owned elsewhere (see ownership notes).

## Sub-Epic of

Part of the **RPG Mechanics & Extensible Game Systems** mega-epic. See parent epic for full scope, integration matrix, and slicing rationale.

## Scope

### Item System

- Item definitions and parameters
- Item types (weapon, armor, consumable, etc.)
- Item rarity (common, uncommon, rare, epic, legendary)
- Unique items with special properties

### Item Economics

- Item economics (buy/sell/trade pricing)
- Money/currency system

### Crafting

- Crafting system (recipes, limitations, pre-compiled items)

## Ownership Notes (do not duplicate)

> - **Inventory UI / trading flows:** owned by **Trading & Inventory** (`epic-trading-inventory.md`), a sub-epic of Epic Battle & Action Systems. This epic owns item definitions and stats only; loot drops feed the inventory pipeline that epic manages.
> - **Spells & battle-side skill rolls:** owned by **Spells & Skills** (`epic-spells-skills.md`, same battle sub-epic family). Scrolls/wands as *items* are defined here; casting mechanics are not.
> - **Professions/crafting labor model:** coordinate with `epic-crafting-professions.md`; this epic owns recipes, stations, and crafted-item stats.
> - **Currency ledger / trade resolution:** coordinate with `epic-economy-trading.md`.

## Tasks

- [ ] Item system with parameters and gameplay impact
- [ ] Item economics and money
- [ ] Unique items
- [ ] Crafting system (recipes, limitations, pre-compiled items)


- [x] Loot system — rarity-weighted tables
## Design (from implementation roadmap)

### File: src/rpg/items.ts

Equipment slots: head, chest, legs, feet, hands, mainHand, offHand, ring1, ring2, amulet, cloak

Item types: weapon, armor, consumable, key_item, currency, container, tool, misc

## Dependencies

- **Parent hub:** epic-rpg-mechanics.md (`rpg.loot_dropped` event feeds inventory + economy)
- **Depends on:** epic-rpg-core-wiring.md (registry + barrel; FIRST in sequence)
- **Siblings:** epic-rpg-progression.md (consumable effects → StatusEffect contract), epic-mechanics-governance.md (`economyEnabled` world flag)
- **External:** Trading & Inventory (`epic-trading-inventory.md`), Economy & Trading (`epic-economy-trading.md`), Crafting & Professions (`epic-crafting-professions.md`), Battle & Action Systems (equipment stats)

## Files

- `src/rpg/items.ts` — item system (not yet implemented)
- `src/rpg/economics.ts` — item economics and money (not yet implemented)
- `src/rpg/crafting/` — crafting module scaffold (recipes/, stations, orders exist)

## Open Questions

### Crafting System

- Should crafting success be purely random or skill-based?
- How to handle recipe discovery — find, buy, or unlock?
- Should crafted items be tradeable?
- How to balance crafting vs. loot drops?

### Item System

- How to handle item scaling with character level?
- Should items have durability degradation over time?
- How to balance unique vs. common items?
- Should items have set bonuses or individual bonuses?
