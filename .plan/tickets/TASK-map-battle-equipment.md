# TASK: Map Battle Equipment to World Item Definitions

**Status:** ⬜ Not Started
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

- [ ] `EquipmentItem` is derived from `ItemDefinition` (not standalone)
- [ ] `ItemQuality` deprecated → `ItemRarity`
- [ ] `ItemType` deprecated → `ItemCategory`
- [ ] Battle equipment calculate endpoint accepts world item IDs
- [ ] Equipping in battle updates `actor_items.equipped`
- [ ] `bun test src/` green; `bun run check` green

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
