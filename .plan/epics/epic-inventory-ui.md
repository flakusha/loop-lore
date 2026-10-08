<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Inventory & Trading UI

**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started — no inventory frontend directory exists (`src/frontend/inventory/` and `src/partials/inventory/` are absent). The trade backend ships (`src/routes/trade/`, `src/services/trade/`) and item CRUD ships (`src/routes/actor-items.ts`, `src/routes/story-items/`), so every capability below is frontend work with a backend to consume.
**Priority:** P1 — High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** inventory, trading, items, ui, frontend

## Summary

Complete inventory management and trading interface, including item grid/list view, equipment loadout, NPC trading, and player-to-player trading.

> **Backend dependency:** This epic depends on [`epic-item-systems-unification.md`](./epic-item-systems-unification.md) for the unified item types, trade system, and actor item service that the UI consumes.

## Core Features

### Inventory Management

- Grid/list view toggle
- Item sorting (name, type, rarity, weight, value)
- Item filtering (type, rarity, equipped, usable)
- Item comparison
- Bulk operations (sell all, trash all)
- Inventory expansion
- Weight/encumbrance display

### Equipment Loadout

- Equipment slots (head, chest, legs, feet, hands, weapon, shield, accessory)
- Equipment stats display
- Set bonuses
- Quick equip/unequip

### NPC Trading

- NPC inventory display
- Buy/sell interface
- Price display (with reputation modifiers)
- Trade offers and counter-offers
- Trade history

### Player-to-Player Trading

- Trade request system
- Secure trade window
- Trade confirmation
- Trade history

## UI Components

### Inventory Grid Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Inventory: 45/100 items                    [Grid] [List]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─ Filters ────────────────────────────────────────────────┐│
│ │ Type: [All ▼]  Rarity: [All ▼]  Sort: [Name ▼]         ││
│ │ [Equipped] [Usable] [Quest] [Trash]                     ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Equipment ──────────────────────────────────────────────┐│
│ │ ┌──────────┐  ┌──────────┐  ┌──────────┐               ││
│ │ │   Head   │  │  Weapon  │  │  Shield  │               ││
│ │ │  [Helm]  │  │  [Sword] │  │  [Shield]│               ││
│ │ └──────────┘  └──────────┘  └──────────┘               ││
│ │ ┌──────────┐  ┌──────────┐  ┌──────────┐               ││
│ │ │  Chest   │  │   Legs   │  │  Accessory│              ││
│ │ │ [Armor]  │  │ [Legs]   │  │  [Ring]  │               ││
│ │ └──────────┘  └──────────┘  └──────────┘               ││
│ │ ┌──────────┐  ┌──────────┐                              ││
│ │ │   Feet   │  │   Hands  │                              ││
│ │ │ [Boots]  │  │ [Gloves] │                              ││
│ │ └──────────┘  └──────────┘                              ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Items Grid ─────────────────────────────────────────────┐│
│ │ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐      ││
│ │ │ ⚔️  │ │ 🛡️  │ │ 🧪  │ │ 📜  │ │ 💎  │ │ 🍎  │      ││
│ │ │Sword│ │Shield│ │Potion│ │Scroll│ │Gem │ │Apple│      ││
│ │ │ 🔵  │ │ 🟢  │ │ 🟢  │ │ 🟡  │ │ 🟣  │ │ ⚪  │      ││
│ │ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘      ││
│ │ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐      ││
│ │ │ 🗡️  │ │ 🏹  │ │ 🧙  │ │ 📖  │ │ 💰  │ │ 🎒  │      ││
│ │ │Dagger│ │Bow  │ │Staff│ │Book │ │Gold │ │Bag  │      ││
│ │ │ 🔵  │ │ 🟢  │ │ 🟡  │ │ 🟢  │ │ ⚪  │ │ 🟢  │      ││
│ │ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘      ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Weight ─────────────────────────────────────────────────┐│
│ │ 🎒 Weight: 45/100 kg  [████████████░░░░░░░░] 45%       ││
│ │ 💰 Gold: 1,250                                           ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Item Details Panel

```
┌─ Item Details ────────────────────────────────────────────────┐
│                                                               │
│ ⚔️ Iron Sword                                                 │
│ ─────────────────────────────────────────────────────────────│
│                                                               │
│ Type: Weapon (Sword)                                          │
│ Rarity: ⚪ Common                                             │
│ Value: 50 Gold                                                │
│ Weight: 3.5 kg                                                │
│                                                               │
│ Stats:                                                        │
│   Damage: 1d8 + 2 Slashing                                   │
│   Crit: 5% (×2)                                              │
│   Speed: Fast                                                 │
│                                                               │
│ Requirements:                                                 │
│   STR: 10                                                     │
│   Proficiency: Simple Weapons                                 │
│                                                               │
│ Description:                                                  │
│ A sturdy iron sword, well-balanced and sharp.                 │
│                                                               │
│ [Equip] [Drop] [Use] [Compare] [Sell: 25 Gold]               │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Trading Interface

```
┌─ Trading: Merchant ────────────────────────────────────────────┐
│                                                               │
│ ┌─ Your Items ─────────────────────────────────────────────┐  │
│ │ 💰 Gold: 1,250                                          │  │
│ │                                                          │  │
│ │ ⚔️ Iron Sword    [Sell: 25 Gold]                        │  │
│ │ 🛡️ Wooden Shield [Sell: 15 Gold]                        │  │
│ │ 🧪 Health Potion [Sell: 10 Gold]                        │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                               │
│ ┌─ Merchant Items ─────────────────────────────────────────┐  │
│ │ 💰 Gold: 500                                             │  │
│ │                                                          │  │
│ │ ⚔️ Steel Sword   [Buy: 100 Gold]                        │  │
│ │ 🛡️ Iron Shield   [Buy: 75 Gold]                         │  │
│ │ 🧪 Mana Potion   [Buy: 30 Gold]                         │  │
│ │ 📜 Fireball Scroll [Buy: 150 Gold]                      │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                               │
│ ┌─ Trade Summary ──────────────────────────────────────────┐  │
│ │ You sell: 3 items (50 Gold)                              │  │
│ │ You buy: 2 items (175 Gold)                              │  │
│ │ Net: -125 Gold                                           │  │
│ │                                                          │  │
│ │ [Cancel Trade]  [Confirm Trade]                          │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

## Integration Points

### Backend Dependencies

| Backend System   | What It Provides          | How Used          |
| ---------------- | ------------------------- | ----------------- |
| Item System      | Item CRUD, stats, effects | Display items     |
| Inventory System | Inventory management      | Display inventory |
| Trading System   | Trading mechanics         | Display trading   |
| Equipment System | Equipment slots, bonuses  | Display equipment |
| Economy System   | Gold, prices, market      | Display prices    |

### Shared Components

| Component    | Used By                      | Notes                 |
| ------------ | ---------------------------- | --------------------- |
| Item card    | Inventory, Trading, Loot     | Reusable item display |
| Stat display | Inventory, Battle, Character | Reusable stat display |
| Grid view    | Inventory, World, NPC        | Reusable grid layout  |
| List view    | Inventory, World, NPC        | Reusable list layout  |

## Acceptance Criteria

- [ ] Inventory grid/list view toggle
- [ ] Item sorting and filtering
- [ ] Item comparison
- [ ] Equipment loadout display
- [ ] Equipment slots
- [ ] NPC trading interface
- [ ] Buy/sell mechanics
- [ ] Price display with modifiers
- [ ] Player-to-player trading
- [ ] Trade confirmation
- [ ] Weight/encumbrance display
- [ ] Mobile responsive
- [ ] Keyboard accessible
- [ ] Screen reader support

## Implementation Phases

### Phase 1: Inventory Display

- Grid/list views
- Item sorting/filtering
- Item details panel

### Phase 2: Equipment

- Equipment slots
- Equipment stats
- Quick equip/unequip

### Phase 3: NPC Trading

- NPC inventory display
- Buy/sell interface
- Price display

### Phase 4: Player Trading

- Trade request system
- Secure trade window
- Trade confirmation

### Phase 5: Polish

- Mobile responsive
- Keyboard accessible
- Screen reader support

## Tasks

| Task                      | Priority | Status         |
| ------------------------- | -------- | -------------- |
| TASK-inventory-grid.md    | P0       | ⬜ Not Started |
| TASK-equipment-slots.md   | P0       | ⬜ Not Started |
| TASK-item-details.md      | P0       | ⬜ Not Started |
| TASK-trading-interface.md | P0       | ⬜ Not Started |
| TASK-inventory-alpine.md  | P0       | ⬜ Not Started |

## Backend Surfaces Consumed

No inventory frontend directory exists yet. The UI consumes these shipped
backend surfaces:

- `src/routes/actor-items.ts` — per-actor item CRUD
- `src/routes/story-items/` — world item definitions + instances
- `src/routes/trade/` — trade offers, NPC counterparty, shared trade routes
- `src/services/trade/` — `TradeService` (settlement primitive)
- `src/services/actor-items/equip.ts` — equip/unequip

## Files to Create

Planned, does not exist yet:

- `src/frontend/inventory/inventory-grid.ts` — Inventory display
- `src/frontend/inventory/equipment-slots.ts` — Equipment loadout
- `src/frontend/inventory/item-details.ts` — Item details panel
- `src/frontend/inventory/trading-interface.ts` — Trading UI
- `src/frontend/alpine/inventory.ts` — Alpine.js inventory logic

## Related Epics

- `epic-item-systems-unification.md` — backend item system this UI consumes
- `epic-inventory-system.md` — hub epic for the inventory stack
- `epic-inventory.md` — actor-side inventory model
- `epic-items.md` — item definitions and lifecycle
- `epic-economy-trading.md` — backend economy system (gold, prices, market)
- `epic-battle-integration-gaps.md` — battle item integration
- `epic-crafting-professions.md` — repair station integration

## Dependencies

- `epic-item-systems-unification.md` — unified item types, trade service, and
  actor item service (In Progress)
- `src/routes/trade/` + `src/services/trade/` — trade backend
- `src/routes/actor-items.ts` — inventory CRUD backend

## Unticketed Gaps

- Weight / encumbrance calculation: no service computes carried weight; the UI
  has nothing to display for the weight bar in the layout above.
- Bulk operations (sell all, trash all) have no backend endpoint.
- Accessibility criteria (keyboard, screen reader) have no ticket; they are
  acceptance criteria on this epic only.

## Linked Tasks

- `TASK-inventory-grid.md`
- `TASK-equipment-slots.md`
- `TASK-item-details.md`
- `TASK-trading-interface.md`
- `TASK-inventory-alpine.md`
