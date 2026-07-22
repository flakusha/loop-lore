# TASK: Item Specification & Parameters System

**Epic:** RPG Mechanics & Extensible Game Systems
**Priority:** High
**Effort:** Large
**Status:** Not Started

## Summary

Implement comprehensive item specification and parameters system with gameplay impact.

## Item Specification

### Item Types

- **Weapons**: Swords, bows, staffs, daggers, etc.
- **Armor**: Helmets, chestplates, gauntlets, boots, etc.
- **Consumables**: Potions, food, scrolls, etc.
- **Materials**: Crafting ingredients, ores, herbs, etc.
- **Tools**: Pickaxes, fishing rods, lockpicks, etc.
- **Quest Items**: Keys, documents, artifacts, etc.
- **Containers**: Bags, chests, pouches, etc.

### Item Properties

- **Base Stats**: Damage, defense, healing, etc.
- **Durability**: Current/max durability
- **Weight**: Inventory weight impact
- **Value**: Buy/sell price
- **Rarity**: Common, uncommon, rare, epic, legendary
- **Quality**: Poor, normal, fine, masterwork, artifact
- **Level Requirement**: Minimum character level
- **Class Restriction**: Allowed classes/roles

## Parameters System

### Stat Parameters

- **Primary Stats**: Strength, dexterity, constitution, etc.
- **Secondary Stats**: Critical chance, dodge, block, etc.
- **Resistances**: Fire, ice, lightning, poison, etc.
- **Bonuses**: XP bonus, gold bonus, etc.

### Dynamic Parameters

- **Enchantments**: Magical enhancements
- **Socketed Gems**: Gem insertion for bonuses
- **Set Bonuses**: Bonus for wearing set pieces
- **Temporary Buffs**: Time-limited enhancements

### Parameter Scaling

- **Level Scaling**: Stats increase with item level
- **Quality Scaling**: Stats increase with quality
- **Enchantment Scaling**: Stats increase with enchantment level

## Gameplay Impact

### Combat Impact

- **Damage Calculation**: Weapon damage + stats + bonuses
- **Defense Calculation**: Armor defense + stats + bonuses
- **Critical Hits**: Based on weapon/character stats
- **Damage Types**: Physical, magical, elemental

### Character Impact

- **Stat Modifiers**: Items modify character stats
- **Skill Modifiers**: Items modify skill effectiveness
- **Movement Speed**: Armor weight affects speed
- **Inventory Capacity**: Container size affects capacity

### Economic Impact

- **Buy/Sell Prices**: Based on rarity, quality, demand
- **Repair Costs**: Based on durability and quality
- **Crafting Costs**: Based on material quality
- **Trading Value**: Player-to-player trading

## Design

### Item Structure

```typescript
interface Item {
  id: string;
  templateId: string;
  name: string;
  description: string;
  type: ItemType;
  rarity: Rarity;
  quality: Quality;
  level: number;
  stats: ItemStats;
  durability: Durability;
  weight: number;
  value: number;
  restrictions: ItemRestrictions;
  enchantments: Enchantment[];
  sockets: Socket[];
  setBonuses: SetBonus[];
  temporaryBuffs: TemporaryBuff[];
}

interface ItemStats {
  primary: Record<string, number>;
  secondary: Record<string, number>;
  resistances: Record<string, number>;
  bonuses: Record<string, number>;
}

interface Durability {
  current: number;
  max: number;
  repairable: boolean;
}
```

### Parameter System

```typescript
interface ItemParameter {
  id: string;
  name: string;
  type: "stat" | "resistance" | "bonus" | "restriction";
  value: number;
  scaling: ScalingConfig;
  conditions: ParameterCondition[];
}

interface ScalingConfig {
  base: number;
  perLevel: number;
  perQuality: number;
  perEnchantment: number;
}
```

## Tasks

- [ ] Design item data model
- [ ] Implement item types
- [ ] Implement item properties
- [ ] Implement stat parameters
- [ ] Implement dynamic parameters
- [ ] Implement parameter scaling
- [ ] Implement combat impact calculations
- [ ] Implement character impact
- [ ] Implement economic impact
- [ ] Create item comparison UI
- [ ] Create item tooltip UI
- [ ] Write tests for item system

## Files

- `src/rpg/items.ts` — item system
- `src/rpg/item-stats.ts` — item statistics
- `src/rpg/item-params.ts` — item parameters
- `src/rpg/item-scaling.ts` — parameter scaling
- `src/db/schema-items.ts` — item tables
- `src/routes/items.ts` — item API
- `src/frontend/rpg/items/` — item UI
