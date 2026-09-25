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
export async function getNpcInventory(state: ItemState, actorId: string, worldId: string,): Promise<ItemInstance[]> {
  const rows = await state.db
    .selectFrom("world_items",)
    .innerJoin("items", "items.id", "world_items.item_id",)
    .select([
      "world_items.id as world_item_id",
      "world_items.item_id",
      "world_items.quantity",
      "world_items.visibility",
      "world_items.world_id",
      "world_items.properties",
      "world_items.current_durability",
      "world_items.max_durability",
      "world_items.is_active",
      "items.name",
      "items.description",
      "items.category",
      "items.rarity",
      "items.properties as definition_properties",
      "items.value",
      "items.weight",
    ],)
    .where("world_items.owner_actor_id", "=", actorId,)
    .where("world_items.world_id", "=", worldId,)
    .where("items.world_id", "=", worldId,)
    .execute();
  return Array.from(rows, (row,) => ({
    worldItemId: row.world_item_id,
    itemId: row.item_id,
    name: row.name,
    description: row.description ?? "",
    category: row.category,
    rarity: row.rarity,
    quantity: row.quantity,
    properties: { ...jsonParseOr(row.definition_properties, {},), ...jsonParseOr(row.properties, {},), },
    worldId: row.world_id,
    isActive: row.is_active === 1,
    currentDurability: row.current_durability,
    maxDurability: row.max_durability,
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
export async function getNpcInventoryBatch(
  state: ItemState,
  actorIds: string[],
  worldId: string,
): Promise<Map<string, ItemInstance[]>> {
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
      "world_items.world_id",
      "world_items.properties",
      "world_items.current_durability",
      "world_items.max_durability",
      "world_items.is_active",
      "items.name",
      "items.description",
      "items.category",
      "items.rarity",
      "items.properties as definition_properties",
      "items.value",
      "items.weight",
    ],)
    .where("world_items.owner_actor_id", "in", actorIds,)
    .where("world_items.world_id", "=", worldId,)
    .where("items.world_id", "=", worldId,)
    .execute();
  const byActor = new Map<string, ItemInstance[]>();
  for (const row of rows) {
    const ownerId = row.owner_actor_id;
    if (ownerId === null) {
      // Unowned row cannot be attributed to any requested actor.
      continue;
    }
    const instance: ItemInstance = {
      worldItemId: row.world_item_id,
      itemId: row.item_id,
      name: row.name,
      description: row.description ?? "",
      category: row.category,
      rarity: row.rarity,
      quantity: row.quantity,
      properties: { ...jsonParseOr(row.definition_properties, {},), ...jsonParseOr(row.properties, {},), },
      worldId: row.world_id,
      isActive: row.is_active === 1,
      currentDurability: row.current_durability,
      maxDurability: row.max_durability,
      value: row.value,
      weight: row.weight,
      visibility: row.visibility,
    };
    const list = byActor.get(ownerId,);
    if (list) {
      list.push(instance,);
    } else {
      byActor.set(ownerId, [instance,],);
    }
  }
  return byActor;
}
