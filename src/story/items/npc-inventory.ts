// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Items Service — NPC Inventory Dispatcher
 *
 * `getNpcInventory` resolves the concrete item instances carried by an
 * NPC (`world_items.owner_actor_id`), joined to their `items` definitions
 * and decoding each row's `properties` JSON. Split out of `instances.ts`
 * to keep that module under the size ceiling.
 */
import { jsonParseOr, } from "../../utils";
import type { ItemInstance, ItemState, } from "./types";

/**
 * Get items carried by an NPC
 * @param state
 * @param actorId
 */
export async function getNpcInventory(state: ItemState, actorId: string,): Promise<ItemInstance[]> {
  const rows = await state.db
    .selectFrom("world_items",)
    .innerJoin("items", "items.id", "world_items.item_id",)
    .select([
      "world_items.id as world_item_id",
      "world_items.item_id",
      "world_items.quantity",
      "world_items.visibility",
      "items.name",
      "items.description",
      "items.category",
      "items.rarity",
      "items.properties",
      "items.value",
      "items.weight",
    ],)
    .where("world_items.owner_actor_id", "=", actorId,)
    .execute();
  return Array.from(rows, (row,) => ({
    worldItemId: row.world_item_id,
    itemId: row.item_id,
    name: row.name,
    description: row.description ?? "",
    category: row.category,
    rarity: row.rarity,
    quantity: row.quantity,
    properties: jsonParseOr(row.properties, {},),
    value: row.value,
    weight: row.weight,
    visibility: row.visibility,
  }),);
}

/**
 * Get items carried by multiple NPCs in one query (avoids N+1 in
 * world-state context assembly). Returns a map actorId -> inventory.
 * BUG-n-1-queries-in-story-world-state-context-per-participant.
 * @param state
 * @param actorIds
 */
export async function getNpcInventoryBatch(state: ItemState, actorIds: string[],): Promise<Map<string, ItemInstance[]>> {
  if (actorIds.length === 0) {
    return new Map();
  }
  const rows = await state.db
    .selectFrom("world_items",)
    .innerJoin("items", "items.id", "world_items.item_id",)
    .select([
      "world_items.owner_actor_id",
      "world_items.id as world_item_id",
      "world_items.item_id",
      "world_items.quantity",
      "world_items.visibility",
      "items.name",
      "items.description",
      "items.category",
      "items.rarity",
      "items.properties",
      "items.value",
      "items.weight",
    ],)
    .where("world_items.owner_actor_id", "in", actorIds,)
    .execute();
  const byActor = new Map<string, ItemInstance[]>();
  for (const row of rows) {
    const instance: ItemInstance = {
      worldItemId: row.world_item_id,
      itemId: row.item_id,
      name: row.name,
      description: row.description ?? "",
      category: row.category,
      rarity: row.rarity,
      quantity: row.quantity,
      properties: jsonParseOr(row.properties, {},),
      value: row.value,
      weight: row.weight,
      visibility: row.visibility,
    };
    const list = byActor.get(row.owner_actor_id);
    if (list) {
      list.push(instance,);
    } else {
      byActor.set(row.owner_actor_id, [instance,],);
    }
  }
  return byActor;
}
