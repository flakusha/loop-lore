# TASK: Character Stats Changes from Equipment (Live Preview)

**Status:** ⬜ Not Started
**Priority:** P1 — High
**Effort:** Medium
**Epic:** epic-item-systems-unification
**Tags:** items, equipment, stats, character, frontend, preview

## Summary

When equipping/unequipping items, players need to see **how their character stats change** before confirming. Currently `TASK-rpg-stats-frontend-wiring.md` wires stats to backend but doesn't address the equip→stat-change feedback loop. This task adds a live stat delta preview when equipping items.

## Current State

- `rpg-stats.ts` Alpine component shows current stats (HP, MP, STR, DEX, etc.)
- `battle/items-integration.ts` has `calculateEquipmentModifiers()` for stat effects
- No UI shows "if you equip this sword: +2 STR, +5 ATK, -1 DEX (heavy)"
- `TASK-equipment-slots.md` covers slot display but not stat change preview

## Work

1. **Stat delta calculation** — extend `rpg-stats.ts`:
   - `getStatDelta(currentEquipped, proposedItem, slot)` → returns `{ stat, current, proposed, delta }[]`
   - Calls `calculateEquipmentModifiers()` with current vs. proposed loadout
   - Handles: equip new item, unequip existing, swap items, dual-wield conflicts
2. **Equip preview UI** — in item details panel and equipment slots:
   - "Preview Equip" button → shows stat changes inline (green + / red -)
   - Side-by-side: current stats → proposed stats
   - Weight change indicator (current → proposed, with capacity bar)
3. **Confirmation flow** — after preview:
   - "Confirm Equip" → calls `ActorItemsService.equip()` + updates stats
   - "Cancel" → reverts preview
4. **Equipment loadout summary** — dedicated panel showing:
   - All equipped items with their stat contributions
   - Total modifiers per stat (base + equipment = effective)
   - Encumbrance bar (current weight / capacity)
5. **Tooltip integration** — hovering over an item in inventory shows stat delta tooltip

## Acceptance Criteria

- [ ] Equipping an item shows stat delta preview before confirmation
- [ ] Stat changes displayed as green (+) / red (-) deltas
- [ ] Weight/encumbrance change shown with capacity bar
- [ ] Equipment loadout summary shows all equipped items + total modifiers
- [ ] Tooltip on inventory items shows equip effect preview
- [ ] Unequipping shows reverse delta (stats going down)
- [ ] `bun test src/frontend` green; `bun run check` green

## Files to Create

- `src/frontend/alpine/equipment-preview.ts` — stat delta preview mixin
- `src/components/character/equipment-summary.html` — loadout summary panel

## Files to Modify

- `src/frontend/alpine/rpg-stats.ts` — add stat delta methods
- `src/frontend/alpine/inventory.ts` — add equip preview flow
- `src/components/chat/character-info-panel.html` — add equipment summary section
- `src/battle/items-integration.ts` — expose `calculateStatDelta()` helper

## Related

- `TASK-rpg-stats-frontend-wiring.md` — base stats wiring (must complete first)
- `TASK-equipment-slots.md` — equipment slot display
- `TASK-item-details.md` — item details panel (add preview button here)
- `TASK-actor-item-service.md` — equip/unequip backend logic
- `TASK-map-battle-equipment.md` — equipment → stat mapping
