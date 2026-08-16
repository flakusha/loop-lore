// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { jsonStringifyOr, } from "../../utils.js";
import { log, } from "./log.js";
import type { RpgServiceDeps, } from "./types.js";

export interface CreateLootTableParams {
  name: string;
  sourceType: string;
  sourceId?: string;
}

export async function createLootTable(
  deps: RpgServiceDeps,
  params: CreateLootTableParams,
): Promise<string> {
  const { database, } = deps;
  const id = crypto.randomUUID();

  await database
    .insertInto("loot_tables",)
    .values({
      id,
      name: params.name,
      source_type: params.sourceType,
      source_id: params.sourceId ?? null,
      total_weight: 0,
    },)
    .execute();

  log().debug("Created loot table", { id, name: params.name, },);
  return id;
}

export interface AddLootEntryParams {
  lootTableId: string;
  itemName: string;
  description?: string;
  itemType: string;
  rarity: string;
  weight: number;
  minQuantity?: number;
  maxQuantity?: number;
  minLevel?: number;
  metadata?: Record<string, unknown>;
}

export async function addLootEntry(
  deps: RpgServiceDeps,
  params: AddLootEntryParams,
): Promise<string> {
  const { database, } = deps;
  const id = crypto.randomUUID();

  await database
    .insertInto("loot_entries",)
    .values({
      id,
      loot_table_id: params.lootTableId,
      item_name: params.itemName,
      description: params.description ?? null,
      item_type: params.itemType,
      rarity: params.rarity,
      weight: params.weight,
      min_quantity: params.minQuantity ?? 1,
      max_quantity: params.maxQuantity ?? 1,
      min_level: params.minLevel ?? 0,
      metadata: jsonStringifyOr(params.metadata ?? {},),
    },)
    .execute();

  // Update total weight
  await database
    .updateTable("loot_tables",)
    .set((eb,) => ({
      total_weight: eb("total_weight", "+", params.weight,),
      updated_at: new Date().toISOString(),
    }))
    .where("id", "=", params.lootTableId,)
    .execute();

  log().debug("Added loot entry", { id, itemName: params.itemName, },);
  return id;
}

export async function rollLootTable(
  deps: RpgServiceDeps,
  lootTableId: string,
): Promise<
  {
    itemName: string;
    description: string | null;
    itemType: string;
    rarity: string;
    quantity: number;
  } | null
> {
  const { database, } = deps;

  // Get all entries
  const entries = await database
    .selectFrom("loot_entries",)
    .where("loot_table_id", "=", lootTableId,)
    .selectAll()
    .execute();

  if (entries.length === 0) {
    return null;
  }

  // Mark table as used
  await database
    .updateTable("loot_tables",)
    .set({ used: 1, },)
    .where("id", "=", lootTableId,)
    .execute();

  // Weighted random selection
  let totalWeight = 0;
  for (const e of entries) { totalWeight += e.weight; }
  let random = Math.random() * totalWeight;

  for (const entry of entries) {
    random -= entry.weight;
    if (random <= 0) {
      const quantity = entry.min_quantity + Math.floor(
        Math.random() * (entry.max_quantity - entry.min_quantity + 1),
      );
      return {
        itemName: entry.item_name,
        description: entry.description,
        itemType: entry.item_type,
        rarity: entry.rarity,
        quantity,
      };
    }
  }

  // Fallback (should not happen)
  const fallback = entries[0]!;
  return {
    itemName: fallback.item_name,
    description: fallback.description,
    itemType: fallback.item_type,
    rarity: fallback.rarity,
    quantity: fallback.min_quantity,
  };
}
