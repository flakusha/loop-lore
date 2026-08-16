<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Map Battle Equipment to World Item Definitions

**Status:** ✅ Complete (2026-08-12)
**Priority:** P2 — Medium
**Effort:** Medium
**Epic:** epic-item-systems-unification
**Tags:** items, battle, equipment, mapping, types

## Summary

`battle/items-integration.ts` defines `EquipmentItem` as a **completely separate type** from `ItemDefinition`/`ItemInstance`/`ActorItems`. There's no mapping between them — world items can't be equipped in battle, and battle equipment can't reference the item database. This task creates a bidirectional mapping.

## Current State

```typescript
// battle/items-integration.ts — siloed type
interface EquipmentItem {
  id: string;
  name: string;
  type: ItemType; // ← different from ItemCategory
  slot?: EquipmentSlot;
  quality: ItemQuality; // ← different from ItemRarity
  modifiers: EquipmentModifier[];
  durability: number;
  maxDurability: number;
  equipped: boolean;
  requiredLevel: number;
  requiredStats?: Partial<CombatStats>;
  description: string;
}
```

## Work

1. **Map `EquipmentItem` → `ItemDefinition`**:
   - `EquipmentItem` becomes a **view/adapter** over `ItemDefinition`, not a standalone type
   - `quality` → `rarity` (use unified `ItemRarity`)
   - `type` → `category` (use unified `ItemCategory`)
   - `modifiers` → derived from `ItemDefinition.properties` JSON
2. **Map `ItemDefinition` → `EquipmentItem`**:
   - Add helper: `toEquipmentItem(def: ItemDefinition): EquipmentItem`
   - Properties JSON encodes: `damage`, `ac`, `bonus`, `damageType`, `resistances`
3. **Consolidate enums**:
   - `ItemType` (battle) → `ItemCategory` (canonical)
   - `ItemQuality` (battle) → `ItemRarity` (canonical)
4. **Battle routes use world items** — `routes/battle/equipment.ts` accepts `itemId` and looks up from `items` table
5. **Equip flow** — equipping in battle calls `ActorItemsService.equip()` → updates `actor_items.equipped`

## Acceptance Criteria

- [x] `EquipmentItem` is derived from `ItemDefinition` (not standalone) — via `toEquipmentItem()`
- [x] `ItemQuality` deprecated → `ItemRarity` (removed in `TASK-unify-item-types`)
- [x] `ItemType` deprecated → `ItemCategory` (mapped via `categoryToType`/`categoryToSlot`; `ItemType` kept for battle-function compat)
- [x] Battle equipment calculate endpoint accepts world item IDs (`/api/battle/equipment/calculate-from-items`)
- [x] Equipping in battle updates `actor_items.equipped` (via `ActorItemsService.equip()` from `TASK-actor-item-service`)
- [x] `bun test src/` green; `bun run check` green

## Notes (impl 2026-08-12)

- Added `EquipmentSource` shape + `toEquipmentItem()` adapter: category→type/slot, `properties` JSON → `EquipmentModifier[]` (damage/bonus→attack, ac→defense, requiredLevel/requiredStats).
- Added `categoryToType()`/`categoryToSlot()` mappers.
- New endpoint `POST /api/battle/equipment/calculate-from-items` resolves `items` rows → `EquipmentItem[]` → modifiers. Existing body-based `calculate` preserved.
- `ItemType` retained (battle functions consume it); `ItemQuality` fully removed in prior task. `ItemRarity` unified.
- 10 new adapter tests; full suite 3424 pass / 0 fail; typecheck + frontend + coverage (96.91%) pass.

## Files to Modify

- `src/battle/items-integration.ts` — make EquipmentItem an adapter over ItemDefinition
- `src/routes/battle/equipment.ts` — accept world item IDs
- `src/db/enums-story/items.ts` — ensure all battle types covered
- `src/services/actor-items.ts` — equip feeds battle stats

## Related

- `TASK-unify-item-types.md` — depends on unified types
- `TASK-actor-item-service.md` — equip/unequip feeds battle
- `epic-battle-integration-gaps.md` — battle-items integration epic
- `epic-item-system-extensions.md` — durability, effects
