/**
 * RPG Loot System
 *
 * Rarity-weighted loot tables, drop chance calculation,
 * and loot generation from enemies/chests/quests.
 */

import { rollDie, type DiceSides, } from "./dice.js";

// ── Types ────────────────────────────────────────────────

/** Item rarity tiers */
export type Rarity = "common" | "uncommon" | "rare" | "legendary" | "artifact";

/** Loot table entry */
export interface LootEntry {
  /** Item name */
  name: string;
  /** Item description */
  description: string;
  /** Item type (weapon, armor, consumable, etc.) */
  type: string;
  /** Rarity */
  rarity: Rarity;
  /** Drop weight (higher = more likely) */
  weight: number;
  /** Minimum quantity */
  minQuantity: number;
  /** Maximum quantity */
  maxQuantity: number;
  /** Required character level to drop */
  minLevel: number;
  /** Item value in gold */
  goldValue: number;
  /** Item metadata */
  metadata: Record<string, unknown>;
}

/** Generated loot result */
export interface LootDrop {
  /** Item name */
  name: string;
  /** Description */
  description: string;
  /** Type */
  type: string;
  /** Rarity */
  rarity: Rarity;
  /** Quantity rolled */
  quantity: number;
  /** Gold value per unit */
  goldValue: number;
  /** Total gold value */
  totalGoldValue: number;
  /** Item metadata */
  metadata: Record<string, unknown>;
}

/** Complete loot generation result */
export interface LootResult {
  /** All items dropped */
  drops: LootDrop[];
  /** Total gold value of all drops */
  totalGoldValue: number;
  /** Whether a rare+ item was found */
  hasRareDrop: boolean;
}

// ── Rarity Weights ───────────────────────────────────────

/** Base drop chance multipliers by rarity */
export const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 50,
  uncommon: 30,
  rare: 15,
  legendary: 4,
  artifact: 1,
};

/** Level-scaling for rarity drops */
const RARITY_LEVEL_BONUS: Record<Rarity, number> = {
  common: 0,
  uncommon: 0,
  rare: 1,
  legendary: 2,
  artifact: 3,
};

/**
 * Get effective drop weight for a rarity at a given level.
 */
export function effectiveWeight(rarity: Rarity, level: number,): number {
  const base = RARITY_WEIGHTS[rarity];
  const bonus = RARITY_LEVEL_BONUS[rarity];
  return base + (level >= 10 ? bonus * 5 : (level >= 5 ? bonus * 2 : 0));
}

// ── Loot Generation ──────────────────────────────────────

/**
 * Generate loot from a loot table.
 *
 * @param entries - Available loot entries
 * @param level - Character level (affects rarity weighting)
 * @param dropCount - Number of items to attempt to drop
 * @param luckModifier - Bonus to drop chance (positive = better drops)
 * @returns Generated loot
 */
export function generateLoot(
  entries: LootEntry[],
  level: number,
  dropCount = 1,
  luckModifier = 0,
): LootResult {
  const drops: LootDrop[] = [];
  let totalGoldValue = 0;
  let hasRareDrop = false;

  // Filter entries by level requirement
  const eligible: LootEntry[] = [];
  for (const entry of entries) {
    if (entry.minLevel <= level) {
      eligible.push(entry,);
    }
  }
  if (eligible.length === 0) {
    return { drops: [], totalGoldValue: 0, hasRareDrop: false, };
  }

  for (let i = 0; i < dropCount; i++) {
    const drop = rollOneDrop(eligible, level, luckModifier,);
    if (drop) {
      drops.push(drop,);
      totalGoldValue += drop.totalGoldValue;
      const rarityPlus = ["rare", "legendary", "artifact",];
      if (rarityPlus.includes(drop.rarity,)) {
        hasRareDrop = true;
      }
    }
  }

  return { drops, totalGoldValue, hasRareDrop, };
}

/**
 * Roll a single drop from eligible entries.
 */
function rollOneDrop(
  entries: LootEntry[],
  level: number,
  luckModifier: number,
): LootDrop | null {
  // Calculate total weight
  let totalWeight = 0;
  for (const entry of entries) {
    totalWeight += effectiveWeight(entry.rarity, level) * entry.weight;
  }

  if (totalWeight === 0) {
    return null;
  }

  // Roll weighted random
  const roll = rollDie(100,);
  const adjustedRoll = Math.max(1, roll - luckModifier,);
  const threshold = (adjustedRoll / 100) * totalWeight;

  let cumulative = 0;
  for (const entry of entries) {
    cumulative += effectiveWeight(entry.rarity, level) * entry.weight;
    if (cumulative >= threshold) {
      const quantity = rollQuantity(entry.minQuantity, entry.maxQuantity,);
      return {
        name: entry.name,
        description: entry.description,
        type: entry.type,
        rarity: entry.rarity,
        quantity,
        goldValue: entry.goldValue,
        totalGoldValue: entry.goldValue * quantity,
        metadata: entry.metadata,
      };
    }
  }

  // Fallback: last entry
  const last = entries[entries.length - 1]!;
  const quantity = rollQuantity(last.minQuantity, last.maxQuantity,);
  return {
    name: last.name,
    description: last.description,
    type: last.type,
    rarity: last.rarity,
    quantity,
    goldValue: last.goldValue,
    totalGoldValue: last.goldValue * quantity,
    metadata: last.metadata,
  };
}

/**
 * Roll quantity within min/max range.
 */
function rollQuantity(min: number, max: number,): number {
  if (min >= max) {
    return min;
  }
  const range = max - min + 1;
  return min + (rollDie(Math.min(range, 100) as DiceSides,) - 1);
}

// ── Loot Table Templates ────────────────────────────────

/** Common consumables */
export const COMMON_CONSUMABLES: LootEntry[] = [
  {
    name: "Health Potion",
    description: "Restores 2d4+2 HP when consumed.",
    type: "consumable",
    rarity: "common",
    weight: 10,
    minQuantity: 1,
    maxQuantity: 3,
    minLevel: 1,
    goldValue: 25,
    metadata: { healing: "2d4+2", },
  },
  {
    name: "Antidote",
    description: "Cures poison and disease.",
    type: "consumable",
    rarity: "common",
    weight: 5,
    minQuantity: 1,
    maxQuantity: 1,
    minLevel: 1,
    goldValue: 50,
    metadata: { cures: ["poison", "disease"], },
  },
];

/** Weapon loot by rarity */
export const WEAPON_LOOT: LootEntry[] = [
  {
    name: "Iron Sword",
    description: "A sturdy iron longsword.",
    type: "weapon",
    rarity: "common",
    weight: 10,
    minQuantity: 1,
    maxQuantity: 1,
    minLevel: 1,
    goldValue: 15,
    metadata: { damage: "1d8", damageType: "slashing", },
  },
  {
    name: "Steel Longsword",
    description: "A well-crafted steel longsword with a sharp edge.",
    type: "weapon",
    rarity: "uncommon",
    weight: 6,
    minQuantity: 1,
    maxQuantity: 1,
    minLevel: 3,
    goldValue: 150,
    metadata: { damage: "1d8+1", damageType: "slashing", bonus: 1, },
  },
  {
    name: "Flame Tongue",
    description: "A blade that ignites with magical fire when wielded.",
    type: "weapon",
    rarity: "rare",
    weight: 2,
    minQuantity: 1,
    maxQuantity: 1,
    minLevel: 8,
    goldValue: 5000,
    metadata: { damage: "1d8+2", damageType: "fire", bonus: 2, },
  },
  {
    name: "Vorpal Sword",
    description: "A legendary blade that decapitates on critical hits.",
    type: "weapon",
    rarity: "legendary",
    weight: 1,
    minQuantity: 1,
    maxQuantity: 1,
    minLevel: 15,
    goldValue: 50_000,
    metadata: { damage: "1d8+3", damageType: "slashing", bonus: 3, vorpal: true, },
  },
];

/** Armor loot by rarity */
export const ARMOR_LOOT: LootEntry[] = [
  {
    name: "Leather Armor",
    description: "Basic leather armor offering minimal protection.",
    type: "armor",
    rarity: "common",
    weight: 10,
    minQuantity: 1,
    maxQuantity: 1,
    minLevel: 1,
    goldValue: 10,
    metadata: { ac: 11, type: "light", },
  },
  {
    name: "Chain Mail",
    description: "Interlocking metal rings providing solid protection.",
    type: "armor",
    rarity: "uncommon",
    weight: 6,
    minQuantity: 1,
    maxQuantity: 1,
    minLevel: 5,
    goldValue: 300,
    metadata: { ac: 16, type: "heavy", },
  },
  {
    name: "Dragon Scale Mail",
    description: "Armor crafted from dragon scales, resistant to fire.",
    type: "armor",
    rarity: "rare",
    weight: 2,
    minQuantity: 1,
    maxQuantity: 1,
    minLevel: 10,
    goldValue: 10_000,
    metadata: { ac: 17, type: "heavy", resistances: ["fire"], },
  },
];

// ── Utility ──────────────────────────────────────────────

/**
 * Create a simple loot table from a list of items.
 */
export function createLootTable(
  items: { name: string; rarity: Rarity; weight?: number; minLevel?: number }[],
): LootEntry[] {
  return Array.from(items, (item,) => ({
    name: item.name,
    description: "",
    type: "miscellaneous",
    rarity: item.rarity,
    weight: item.weight ?? RARITY_WEIGHTS[item.rarity],
    minQuantity: 1,
    maxQuantity: 1,
    minLevel: item.minLevel ?? 1,
    goldValue: 0,
    metadata: {},
  }),);
}

/**
 * Merge multiple loot tables into one.
 */
export function mergeLootTables(...tables: LootEntry[][]): LootEntry[] {
  const out: LootEntry[] = [];
  for (const sub of tables) { for (const x of sub) { out.push(x,); } }
  return out;
}
