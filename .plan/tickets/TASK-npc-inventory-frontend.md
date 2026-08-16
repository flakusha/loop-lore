<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: NPC Inventory Frontend (View & Trade)

**Status:** ⬜ Not Started
**Priority:** P1 — High
**Effort:** Medium
**Epic:** epic-item-systems-unification
**Tags:** items, npc, inventory, trade, frontend

## Summary

No frontend exists to **view NPC inventories** or **trade with NPCs**. `TASK-npc-inventory.md` describes the backend but has no UI component. After `TASK-link-npc-inventory.md` replaces the denormalized JSON with `world_items` references, we need a frontend to browse and interact with NPC inventories.

## Current State

- `npc_states.inventory` is a JSON string array (will be replaced by `world_items.owner_actor_id`)
- `ItemsService.getNpcInventory(actorId)` already returns resolved items
- No route or UI to view "what is Gandalf carrying?"
- `TASK-trading-interface.md` covers trading but assumes player-to-player, not NPC

## Work

1. **NPC inventory view** — in character/NPC detail panel:
   - List of items carried by NPC (name, quantity, category, rarity)
   - Total weight carried
   - Equipped items highlighted
   - Empty state for NPCs with no items
2. **NPC trading interface** — extend `TASK-trading-interface.md`:
   - NPC inventory on one side, player inventory on the other
   - Buy: player gives gold → receives item from NPC
   - Sell: player gives item → receives gold from NPC
   - Price calculation (base value × buy/sell multiplier)
   - NPC gold balance (for buying from player)
3. **Trade initiation** — from NPC chat or character panel:
   - "Trade with [NPC]" button → opens trading modal
   - NPC disposition affects prices (friendly = better deals)
4. **GM override** — world owner can directly add/remove items from NPC inventory (provisioning)

## Acceptance Criteria

- [ ] NPC inventory viewable in character/NPC detail panel
- [ ] Items show name, quantity, category, rarity, equipped status
- [ ] Trading interface: buy from NPC, sell to NPC
- [ ] Price calculation with NPC disposition modifier
- [ ] GM can directly manage NPC inventory (add/remove items)
- [ ] Trading updates `world_items` ownership via `ItemsService.transfer()`
- [ ] `bun test src/frontend` green; `bun run check` green

## Files to Create

- `src/frontend/alpine/npc-inventory.ts` — NPC inventory Alpine mixin
- `src/components/character/npc-inventory-panel.html` — inventory panel template
- `src/frontend/alpine/npc-trading.ts` — NPC trading UI logic

## Files to Modify

- `src/views/characters.html` — add NPC inventory section
- `src/frontend/alpine/trading-interface.ts` — extend for NPC trading
- `src/routes/actor-items.ts` — add NPC inventory endpoint if needed

## Related

- `TASK-link-npc-inventory.md` — NPC inventory linked to world items (dependency)
- `TASK-trading-interface.md` — base trading UI (extend for NPC)
- `TASK-implement-trade.md` — trade backend (currency + transfer)
- `TASK-item-provisioning-dashboard.md` — GM provisioning includes NPC allocation
- `epic-inventory-ui.md` — inventory/trading UI epic
