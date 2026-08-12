/**
 * Items Integration for Battle
 *
 * Equipment stats, durability, loot drops, and inventory management.
 */
import type {
  CombatStats,
  EquipmentModifier,
  EquipmentSlot,
} from "./integration-schemas";
import type { ItemCategory, ItemRarity, } from "../db/enums";

/** Item type */
export type ItemType =
  | "weapon"
  | "armor"
  | "helmet"
  | "boots"
  | "gloves"
  | "accessory"
  | "shield"
  | "consumable"
  | "material"
  | "quest";

/** Map a unified `ItemCategory` to a battle `ItemType` (best-effort). */
export function categoryToType(category: ItemCategory,): ItemType {
  switch (category) {
    case "weapon":
      return "weapon";
    case "armor":
      return "armor";
    case "consumable":
      return "consumable";
    case "material":
      return "material";
    case "key_item":
    case "quest_item":
      return "quest";
    case "tool":
    case "container":
    case "treasure":
    case "book":
    case "artifact":
    case "misc":
    case "other":
      return "accessory";
  }
}

/** Map a unified `ItemCategory` to an equipment slot (or undefined). */
export function categoryToSlot(category: ItemCategory,): EquipmentSlot | undefined {
  switch (category) {
    case "weapon":
      return "weapon";
    case "armor":
      return "armor";
    default:
      return undefined;
  }
}

/** Source shape for building an `EquipmentItem` (subset of a world item definition). */
export interface EquipmentSource {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  rarity: ItemRarity;
  properties: Record<string, unknown>;
}

/**
 * Build an `EquipmentItem` from a world item definition source.
 *
 * Stat modifiers are decoded from `properties` JSON:
 *   { damage, ac, bonus, damageType, resistances, ... }
 * `damage`/`bonus` map to `attack`; `ac` maps to `defense`; optional
 * `requiredLevel`/`requiredStats` carry equip requirements.
 */
export function toEquipmentItem(def: EquipmentSource,): EquipmentItem {
  const props = def.properties ?? {};
  const slot = categoryToSlot(def.category,);
  const modifiers: EquipmentModifier[] = [];

  const damage = typeof props.damage === "number" ? props.damage : undefined;
  const ac = typeof props.ac === "number" ? props.ac : undefined;
  const bonus = typeof props.bonus === "number" ? props.bonus : undefined;

  if (typeof damage === "number" && damage !== 0) {
    modifiers.push({ stat: "attack", value: damage, });
  }
  if (typeof bonus === "number" && bonus !== 0) {
    modifiers.push({ stat: "attack", value: bonus, });
  }
  if (typeof ac === "number" && ac !== 0) {
    modifiers.push({ stat: "defense", value: ac, });
  }

  const requiredLevel = typeof props.requiredLevel === "number" ? props.requiredLevel : 1;
  const requiredStats = props.requiredStats as Partial<CombatStats> | undefined;

  return {
    id: def.id,
    name: def.name,
    type: categoryToType(def.category,),
    slot,
    rarity: def.rarity,
    modifiers,
    durability: 100,
    maxDurability: 100,
    equipped: false,
    requiredLevel,
    requiredStats,
    description: def.description,
  };
}

/** Equipment item */
export interface EquipmentItem {
  /** Item ID */
  id: string;
  /** Item name */
  name: string;
  /** Item type */
  type: ItemType;
  /** Equipment slot (if equippable) */
  slot?: EquipmentSlot;
  /** Item rarity */
  rarity: ItemRarity;
  /** Stat modifiers when equipped */
  modifiers: EquipmentModifier[];
  /** Durability (0-100) */
  durability: number;
  /** Maximum durability */
  maxDurability: number;
  /** Whether item is currently equipped */
  equipped: boolean;
  /** Required level to equip */
  requiredLevel: number;
  /** Required stats to equip */
  requiredStats?: Partial<CombatStats>;
  /** Item description */
  description: string;
}

/** Calculate equipment stat modifiers */
export function calculateEquipmentModifiers(
  items: EquipmentItem[],
): EquipmentModifier[] {
  const modifiers: EquipmentModifier[] = [];

  for (const item of items) {
    if (!item.equipped) { continue; }

    for (const mod of item.modifiers) {
      // Durability affects modifier effectiveness
      const durabilityFactor = item.durability / item.maxDurability;
      const effectiveValue = Math.round(mod.value * durabilityFactor,);

      modifiers.push({
        ...mod,
        value: effectiveValue,
      },);
    }
  }

  return modifiers;
}

/** Check if item can be equipped */
export function canEquipItem(
  item: EquipmentItem,
  characterLevel: number,
  characterStats: CombatStats,
): { canEquip: boolean; reason?: string } {
  if (characterLevel < item.requiredLevel) {
    return {
      canEquip: false,
      reason: `Requires level ${item.requiredLevel}`,
    };
  }

  if (item.requiredStats) {
    for (const [stat, required,] of Object.entries(item.requiredStats,)) {
      const currentValue = characterStats[stat as keyof CombatStats];
      if (typeof currentValue === "number" && typeof required === "number" && currentValue < required) {
        return {
          canEquip: false,
          reason: `Requires ${stat} ${required}`,
        };
      }
    }
  }

  if (item.durability <= 0) {
    return {
      canEquip: false,
      reason: "Item is broken",
    };
  }

  return { canEquip: true, };
}

/** Apply durability damage to item */
export function applyDurabilityDamage(
  item: EquipmentItem,
  damage: number,
): EquipmentItem {
  const newDurability = Math.max(0, item.durability - damage,);
  return {
    ...item,
    durability: newDurability,
  };
}

/** Repair item durability */
export function repairItem(
  item: EquipmentItem,
  repairAmount: number,
  goldCost: number,
): { item: EquipmentItem; goldSpent: number } {
  const newDurability = Math.min(item.maxDurability, item.durability + repairAmount,);
  return {
    item: {
      ...item,
      durability: newDurability,
    },
    goldSpent: goldCost,
  };
}

/** Loot table entry */
export interface LootTableEntry {
  /** Item ID */
  itemId: string;
  /** Drop chance (0-100) */
  dropChance: number;
  /** Minimum quantity */
  minQuantity: number;
  /** Maximum quantity */
  maxQuantity: number;
  /** Required monster level */
  requiredLevel: number;
}

/** Generate loot from a loot table */
export function generateLoot(
  lootTable: LootTableEntry[],
  monsterLevel: number,
): { itemId: string; quantity: number }[] {
  const drops: { itemId: string; quantity: number }[] = [];

  for (const entry of lootTable) {
    // Check level requirement
    if (monsterLevel < entry.requiredLevel) { continue; }

    // Roll for drop
    const roll = Math.random() * 100;
    if (roll <= entry.dropChance) {
      const quantity = Math.floor(
        Math.random() * (entry.maxQuantity - entry.minQuantity + 1) + entry.minQuantity,
      );
      drops.push({
        itemId: entry.itemId,
        quantity,
      },);
    }
  }

  return drops;
}

/** Calculate item sell price based on quality and durability */
export function calculateSellPrice(
  item: EquipmentItem,
  basePrice: number,
): number {
  const rarityMultipliers: Record<ItemRarity, number> = {
    common: 1,
    uncommon: 1.5,
    rare: 2.5,
    epic: 5,
    legendary: 10,
    unique: 15,
    artifact: 20,
  };

  const rarityMultiplier = rarityMultipliers[item.rarity] ?? 1;
  const durabilityFactor = item.durability / item.maxDurability;

  return Math.round(basePrice * rarityMultiplier * durabilityFactor * 0.5,);
}

/** Get items in a specific equipment slot */
export function getEquippedInSlot(
  items: EquipmentItem[],
  slot: EquipmentSlot,
): EquipmentItem | undefined {
  return items.find(item => item.equipped && item.slot === slot);
}

/** Get all equipped items */
export function getEquippedItems(items: EquipmentItem[],): EquipmentItem[] {
  const equipped: EquipmentItem[] = [];
  for (const item of items) { if (item.equipped) { equipped.push(item,); } }
  return equipped;
}

/** Calculate total weight of items */
export function calculateTotalWeight(
  items: EquipmentItem[],
  weightMap: Map<string, number>,
): number {
  let totalWeight = 0;
  for (const item of items) {
    const weight = weightMap.get(item.id,) ?? 0;
    totalWeight += weight;
  }
  return totalWeight;
}
