<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Item Provisioning Dashboard (World-Level Allocation View)

**Status:** ⬜ Not Started
**Priority:** P1 — High
**Effort:** Medium
**Epic:** epic-item-systems-unification
**Tags:** items, provisioning, allocation, world, frontend, dashboard

## Summary

A unified **world item provisioning dashboard** that shows all items in a world and lets the GM allocate them — place into locations, assign to NPCs, or leave unallocated. Currently item management is scattered across tabs (world-edit items tab for definitions, instances tab for placement) with no overview of what's allocated where.

## Current State

- `world-items.ts` Alpine mixin handles item definitions + placement per-item
- No single view shows: "Sword → carried by Gandalf", "Potion → at Darkwood", "Gem → unallocated"
- Provisioning requires opening each item's expansion panel individually

## Work

1. **Provisioning overview panel** — new tab or section in `world-edit.html`:
   - Table/list of all item definitions with allocation status
   - Columns: name, category, rarity, quantity (total), allocated (where), actions
   - Filter by allocation status (unallocated / in-location / carried-by-npc)
2. **Bulk allocation** — select multiple items → assign to location or NPC in one action
3. **Quick allocate** — drag-and-drop or dropdown to assign item to location/NPC from the list
4. **Unallocated items highlight** — visual indicator for items not yet placed
5. **Allocation from NPC/location view** — reverse lookup: click NPC → see/add carried items

## Acceptance Criteria

- [ ] Single view shows all world items with allocation status
- [ ] Can allocate item to location or NPC from the provisioning panel
- [ ] Bulk allocation (multiple items → one target)
- [ ] Unallocated items visually highlighted
- [ ] Filter by: all / unallocated / in-location / carried
- [ ] Allocation updates `world_items` via `ItemsService.placeInLocation()` / `giveToNpc()`
- [ ] `bun test src/frontend` green; `bun run check` green

## Files to Create

- `src/frontend/alpine/world-item-provisioning.ts` — provisioning Alpine mixin
- `src/views/partials/worlds/item-provisioning-panel.html` — panel template

## Files to Modify

- `src/views/world-edit.html` — add provisioning tab/section

## Related

- `TASK-world-item-frontend.md` — base item UI (creation + settings)
- `TASK-world-item-instance-npc.md` — NPC placement extension
- `TASK-link-npc-inventory.md` — NPC inventory linked to world items
- `epic-inventory-ui.md` — inventory UI epic
