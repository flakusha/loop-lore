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

/** Get items carried by an NPC */
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
