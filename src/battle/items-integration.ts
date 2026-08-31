// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Items Integration for Battle
 *
 * Equipment stats, durability, loot drops, and inventory management.
 */
import type { ItemRarity, } from "../db/enums";
import type {
  CombatStats,
  EquipmentModifier,
  EquipmentSlot,
} from "./integration-schemas";
import { type EquipmentItem, } from "./item-mapping";

export {
  categoryToSlot,
  categoryToType,
  type EquipmentItem,
  type EquipmentSource,
  type ItemType,
  toEquipmentItem,
} from "./item-mapping";

/**
 * Calculate equipment stat modifiers
 * @param items
 */
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

/**
 * Check if item can be equipped
 * @param item
 * @param characterLevel
 * @param characterStats
 */
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

/**
 * Apply durability damage to item
 * @param item
 * @param damage
 */
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

/**
 * Repair item durability
 * @param item
 * @param repairAmount
 * @param goldCost
 */
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

/**
 * Generate loot from a loot table
 * @param lootTable
 * @param monsterLevel
 */
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

/**
 * Calculate item sell price based on quality and durability
 * @param item
 * @param basePrice
 */
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

/**
 * Get items in a specific equipment slot
 * @param items
 * @param slot
 */
export function getEquippedInSlot(
  items: EquipmentItem[],
  slot: EquipmentSlot,
): EquipmentItem | undefined {
  return items.find(item => item.equipped && item.slot === slot);
}

/**
 * Get all equipped items
 * @param items
 */
export function getEquippedItems(items: EquipmentItem[],): EquipmentItem[] {
  const equipped: EquipmentItem[] = [];
  for (const item of items) { if (item.equipped) { equipped.push(item,); } }
  return equipped;
}

/**
 * Calculate total weight of items
 * @param items
 * @param weightMap
 */
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
