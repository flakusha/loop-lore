// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type DiceSides, rollDie, } from "../dice.js";
import {
  type LootDrop,
  type LootEntry,
  type LootResult,
} from "./types.js";
import { effectiveWeight, } from "./weights.js";

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
    return { drops: [], totalGoldValue: 0, hasRareDrop: false, worldItemIds: [], };
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

  return { drops, totalGoldValue, hasRareDrop, worldItemIds: [], };
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
    totalWeight += effectiveWeight(entry.rarity, level,) * entry.weight;
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
    cumulative += effectiveWeight(entry.rarity, level,) * entry.weight;
    if (cumulative >= threshold) {
      const quantity = rollQuantity(entry.minQuantity, entry.maxQuantity,);
      return {
        name: entry.name,
        description: entry.description,
        type: entry.type,
        rarity: entry.rarity,
        itemId: entry.itemId,
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
    itemId: last.itemId,
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
  return min + (rollDie(Math.min(range, 100,) as DiceSides,) - 1);
}
