// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import {
  type LootEntry,
  type Rarity,
} from "./types.js";
import { RARITY_WEIGHTS, } from "./weights.js";

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
