<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Items Specification

**Status:** Final
**Authoritative source:** `src/` and `AGENTS.md`

---

## Overview

This document defines the item system for loop-lore: what items exist, their types, properties, rarity, and how they interact with the game world.

The item system is separate from the inventory system (`docs/spec/inventory.md`). It handles item definitions and behavior while inventory.md handles storage and management.

---

## 1. Item Type Taxonomy

### 1.1 Primary Item Categories

| Category       | Description                                            | Examples                                 |
| -------------- | ------------------------------------------------------ | ---------------------------------------- |
| **Weapon**     | Items used in combat                                   | Sword, bow, staff, dagger                |
| **Armor**      | Items worn for protection                              | Shield, helmet, chestplate, robes        |
| **Consumable** | Single-use items, consumed on use                      | Potion, scroll, food, ammunition         |
| **Usable**     | Items that can be used multiple times but have charges | Wand, staff, tool, instrument            |
| **Equippable** | Items that can be worn/held, persistent                | Ring, amulet, cloak, quiver              |
| **Key Item**   | Quest items, cannot be traded or dropped               | Map fragment, quest artifact, royal seal |
| **Currency**   | Money and trade items                                  | Gold, silver, copper, platinum           |
| **Material**   | Crafting components                                    | Ore, leather, herb, crystal              |
| **Container**  | Items that hold other items                            | Backpack, chest, satchel, quiver         |
| **Tool**       | Non-combat utility items                               | Lockpick, fishing rod, hammer, lens      |
| **Lore**       | Books, scrolls, knowledge items                        | Tome, letter, map, journal               |
| **Trinket**    | Minor items with small effects                         | Lucky charm, token, keepsake             |
| **Mount**      | Mounts and transportation                              | Horse, carriage, flying carpet           |
| **Companion**  | Summoned or tamed creatures                            | Familiar, pet, construct                 |

### 1.2 Item Use States

Items have a state machine that governs their lifecycle:

```typescript
enum ItemUseState {
  Available = "available", // Ready to use/equip
  Equipped = "equipped", // Currently equipped in a slot
  InUse = "in_use", // Being used (consumable in progress)
  Consumed = "consumed", // Used up and destroyed
  Depleted = "depleted", // Out of charges, needs recharge
  Broken = "broken", // Durability reached zero
  Locked = "locked", // Quest-locked or soulbound
  Traded = "traded", // Recently traded, on cooldown
}
```

### 1.3 Item Collect States

Items have a collection state that tracks their ownership:

```typescript
enum ItemCollectState {
  Unowned = "unowned", // Not in anyone's inventory (world item, shop stock)
  Owned = "owned", // In a character's or NPC's inventory
  Traded = "traded", // In transit between inventories
  Stolen = "stolen", // Taken without permission (may have consequences)
  Lost = "lost", // Dropped, fallen, or abandoned
  Destroyed = "destroyed", // Permanently removed
  Archived = "archived", // Stored in museum/collection, not in active use
}
```

### 1.4 Item Consumption States

For consumable and usable items:

```typescript
enum ItemConsumeState {
  Ready = "ready", // Can be consumed
  Pending = "pending", // Consumption in progress (animation, cast time)
  Consumed = "consumed", // Fully consumed, item destroyed or depleted
}
```

---

## 2. Item Properties

### 2.1 Base Properties

Every item has these base properties:

```typescript
interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  type: ItemCategory;
  rarity: Rarity;
  icon: string; // asset reference
  weight: number; // in kg
  value: number; // base gold value
  stackable: boolean;
  maxStack: number;
  soulbound: boolean;
  questLocked: boolean;
  droppable: boolean;
  tradeable: boolean;
  sellable: boolean;
  destroyable: boolean;

  // Type-specific properties
  properties: ItemProperties;
}

interface ItemProperties {
  // Weapon properties
  damage?: DamageProfile;
  weaponType?: WeaponType;
  speed?: number; // attack speed
  range?: number; // melee/ranged range

  // Armor properties
  defense?: number;
  armorType?: ArmorType;
  resistance?: Record<DamageType, number>;

  // Consumable properties
  effects?: ConsumableEffect[];
  charges?: number; // -1 = unlimited
  useDelay?: number; // seconds between uses

  // Usable properties
  abilities?: UsableAbility[];
  cooldown?: number; // seconds between uses

  // Equippable properties
  slot?: EquipmentSlot;
  statModifiers?: StatModifier[];
  setBonus?: string; // set ID if part of a set

  // Container properties
  capacity?: number; // max items the container can hold
  maxWeight?: number; // max weight the container can hold

  // Tool properties
  skillBonus?: string; // skill that benefits from this tool
  craftable?: boolean; // can this be used in crafting?
}
```

### 2.2 Damage Profile

```typescript
interface DamageProfile {
  baseDamage: number;
  damageType: DamageType;
  scalingStat: string; // which stat scales the damage
  scalingFactor: number; // multiplier per stat point
  bonusDamage: number; // flat bonus
  variance: number; // 0-1, damage randomization range
  criticalMultiplier: number; // critical hit damage multiplier
  piercing: number; // armor penetration percentage
  effects: DamageEffect[]; // on-hit effects
}

enum DamageType {
  Slashing = "slashing",
  Piercing = "piercing",
  Bludgeoning = "bludgeoning",
  Fire = "fire",
  Ice = "ice",
  Lightning = "lightning",
  Poison = "poison",
  Necrotic = "necrotic",
  Radiant = "radiant",
  Force = "force",
  Psychic = "psychic",
  Cold = "cold",
  Acid = "acid",
  Thunder = "thunder",
  Holy = "holy",
  Unholy = "unholy",
}
```

### 2.3 Rarity System

| Rarity    | Label | Stat Multiplier | Drop Rate | Value Multiplier | Color  |
| --------- | ----- | --------------- | --------- | ---------------- | ------ |
| Common    | —     | 1.0x            | 60%       | 1.0x             | Gray   |
| Uncommon  | +     | 1.2x            | 25%       | 1.5x             | Green  |
| Rare      | ★     | 1.5x            | 10%       | 3.0x             | Blue   |
| Epic      | ★★    | 2.0x            | 4%        | 8.0x             | Purple |
| Legendary | ★★★   | 3.0x            | 1%        | 20.0x            | Orange |
| Mythic    | ★★★★  | 5.0x            | 0.1%      | 50.0x            | Gold   |

Rarity affects:

- Stat bonuses (multiplier on base stats)
- Drop probability
- Sell value
- Crafting difficulty
- Visual effects (glow, particles)
- Identification difficulty (rare+ items need identification)

---

## 3. Item Effects

### 3.1 Passive Effects

```typescript
interface PassiveEffect {
  id: string;
  type: "stat_boost" | "regen" | "resistance" | "aura" | "passive_ability";
  stat?: string;
  value: number;
  stackable: boolean;
  max_stacks: number;
  condition?: EffectCondition; // when does this apply?
}
```

### 3.2 Active Effects

```typescript
interface ActiveEffect {
  id: string;
  name: string;
  type: "spell" | "ability" | "consumable" | "trigger";
  cooldown: number; // seconds
  charges: number; // -1 = unlimited
  cost: EffectCost;
  effect: EffectResult;
}
```

### 3.3 Set Bonuses

```typescript
interface SetBonus {
  set_id: string;
  set_name: string;
  pieces_required: number; // how many pieces to activate
  bonus: SetBonusEffect;
  pieces: string[]; // item definition IDs in this set
}

interface SetBonusEffect {
  type: "stat_boost" | "new_ability" | "resistance" | "skill_enhance";
  stats?: Record<string, number>;
  new_ability?: string;
  resistance_bonus?: Record<string, number>;
  skill_bonus?: Record<string, number>;
}
```

---

## 4. Item Economics

### 4.1 Value System

```typescript
interface ItemValue {
  base_value: number; // gold
  rarity_multiplier: number; // from rarity table
  condition_modifier: number; // 0.5-1.5 based on durability
  demand_modifier: number; // 0.5-2.0 based on market demand
  seller_modifier: number; // NPC-specific markup
  buyer_modifier: number; // NPC-specific discount
  final_value: number; // calculated: base × all modifiers
}
```

### 4.2 Price Factors

| Factor         | Effect                       | Range     |
| -------------- | ---------------------------- | --------- |
| Rarity         | Higher rarity = higher value | 1x-5x     |
| Condition      | Damaged items worth less     | 0.5x-1.5x |
| Demand         | High demand = higher prices  | 0.5x-2.0x |
| Supply         | Low supply = higher prices   | 0.5x-2.0x |
| Seller markup  | NPC shop markup              | 0.8x-2.0x |
| Buyer discount | Reputation discount          | 0.8x-1.0x |
| Location       | City vs wilderness prices    | 0.7x-2.0x |
| Economy        | World economic state         | 0.5x-2.0x |

---

## 5. Item Crafting

### 5.1 Recipe System

```typescript
interface CraftingRecipe {
  id: string;
  name: string;
  result: CraftingResult;
  ingredients: CraftingIngredient[];
  tools: string[]; // tool item IDs required
  skill_required: string; // crafting skill
  skill_level: number; // minimum skill level
  difficulty: number; // 1-100
  success_rate: number; // base success chance
  time_required: number; // seconds
  xp_reward: number; // XP for successful craft
}

interface CraftingResult {
  item_id: string;
  quantity: number;
  quality_bonus: number; // 0-100, affects item rarity
  bonus_chance: number; // chance of bonus item
}

interface CraftingIngredient {
  item_id: string;
  quantity: number;
  consumed: boolean; // whether the ingredient is consumed
}
```

### 5.2 Crafting Stations

| Station     | Crafts            | Requirements                |
| ----------- | ----------------- | --------------------------- |
| Forge       | Weapons, armor    | Fire source, anvil, hammer  |
| Alchemy     | Potions, poisons  | Mortar, pestle, ingredients |
| Workshop    | Tools, containers | Workbench, tools            |
| Tailoring   | Clothing, bags    | Loom, needle, thread        |
| Enchanter   | Enchanted items   | Arcane focus, reagents      |
| Kitchen     | Food, drink       | Cooking fire, utensils      |
| Engineering | Gadgets, traps    | Tools, materials            |

---

## 6. Database Schema

### item_definitions (new table)

```sql
CREATE TABLE item_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL, -- item category
  rarity TEXT NOT NULL DEFAULT 'common', -- common, uncommon, rare, epic, legendary, mythic
  icon TEXT, -- asset reference
  weight REAL NOT NULL DEFAULT 0.0,
  value INTEGER NOT NULL DEFAULT 0,
  stackable INTEGER NOT NULL DEFAULT 0,
  max_stack INTEGER NOT NULL DEFAULT 1,
  soulbound INTEGER NOT NULL DEFAULT 0,
  quest_locked INTEGER NOT NULL DEFAULT 0,
  droppable INTEGER NOT NULL DEFAULT 1,
  tradeable INTEGER NOT NULL DEFAULT 1,
  sellable INTEGER NOT NULL DEFAULT 1,
  properties JSON NOT NULL DEFAULT '{}',
  effects JSON NOT NULL DEFAULT '[]',
  set_id TEXT, -- for set bonuses
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### world_items (existing, extended)

```sql
-- Already defined in schema-story.ts
-- Add:
ALTER TABLE world_items ADD COLUMN item_definition_id TEXT REFERENCES item_definitions(id);
ALTER TABLE world_items ADD COLUMN owner_actor_id TEXT REFERENCES actors(id); -- null = unowned
ALTER TABLE world_items ADD COLUMN location_id TEXT REFERENCES locations(id); -- location where item is
ALTER TABLE world_items ADD COLUMN stored_at TEXT REFERENCES storages(id); -- storage container
ALTER TABLE world_items ADD COLUMN durability_current INTEGER;
ALTER TABLE world_items ADD COLUMN durability_max INTEGER;
ALTER TABLE world_items ADD COLUMN charges INTEGER;
ALTER TABLE world_items ADD COLUMN collect_state TEXT NOT NULL DEFAULT 'unowned'; -- enum
ALTER TABLE world_items ADD COLUMN use_state TEXT NOT NULL DEFAULT 'available'; -- enum
ALTER TABLE world_items ADD COLUMN consume_state TEXT NOT NULL DEFAULT 'ready'; -- enum
ALTER TABLE world_items ADD COLUMN history JSON NOT NULL DEFAULT '[]'; -- item history log
```

---

## 7. Implementation Notes

### Files to Create

| File                     | Purpose                       |
| ------------------------ | ----------------------------- |
| `src/items/types.ts`     | Item type definitions         |
| `src/items/registry.ts`  | Item definition registry      |
| `src/items/effects.ts`   | Item effect resolution        |
| `src/items/rarity.ts`    | Rarity system                 |
| `src/items/crafting.ts`  | Crafting recipes and stations |
| `src/items/economics.ts` | Item valuation and pricing    |
| `src/db/schema-items.ts` | Item schema types             |
| `src/routes/items.ts`    | Item API routes               |

### Files to Modify

| File                     | Purpose                  |
| ------------------------ | ------------------------ |
| `src/db/schema-story.ts` | Extend item tables       |
| `src/routes/actors.ts`   | Add item endpoints       |
| `src/routes/world.ts`    | Add world item endpoints |

---

## Reference

| Document                                     | Covers                                              |
| -------------------------------------------- | --------------------------------------------------- |
| `docs/spec/inventory.md`                     | Inventory management, capacity, equipment slots     |
| `docs/spec/rpg-mechanics.md`                 | Item transfer, trading, economy                     |
| `docs/spec/actors.md`                        | Actor item tables                                   |
| `docs/spec/character-spec.md`                | Character inventory extensions                      |
| `.plan/epics/epic-item-system-extensions.md` | Item extensions (durability, effects, unique items) |
| `.plan/epics/epic-rpg-mechanics.md`          | RPG item system overview                            |
