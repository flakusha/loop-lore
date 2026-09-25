// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Items Service — Instance Dispatchers
 *
 * World item instances: placement, inventory, transfer, destroy.
 */
import type { Transaction, } from "kysely";
import { ItemVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { uid, } from "../../utils";
import type { ItemState, TransferResult, } from "./types";

export { applyDrift, decrementDurability, getUniqueItem, } from "./instance-state";
export { getAtLocation, giveToNpc, placeInLocation, } from "./placement";

export { getNpcInventory, getNpcInventoryBatch, } from "./npc-inventory";

/**
 * Transfer items between locations, NPCs, or from world to actor. Requires worldId to prevent cross-world IDOR.
 * @param state
 * @param worldItemId
 * @param worldId
 * @param quantity
 * @param toLocationId
 * @param toActorId
 * @param trx
 */
export async function transfer(
  state: ItemState,
  worldItemId: string,
  worldId: string,
  quantity: number,
  toLocationId?: string,
  toActorId?: string,
  trx?: Transaction<DB>,
): Promise<TransferResult> {
  const db = trx ?? state.db;
  const source = await db
    .selectFrom("world_items",)
    .selectAll()
    .where("id", "=", worldItemId,)
    .where("world_id", "=", worldId,)
    .executeTakeFirst();
  if (!source || !Number.isInteger(quantity,) || quantity <= 0 || (toLocationId && toActorId)) {
    return { success: false, fromRemaining: 0, toQuantity: 0, transferred: 0, };
  }
  const definition = await db
    .selectFrom("items",)
    .select("id",)
    .where("id", "=", source.item_id,)
    .where("world_id", "=", worldId,)
    .executeTakeFirst();
  if (!definition) { return { success: false, fromRemaining: source.quantity, toQuantity: 0, transferred: 0, }; }
  if (toLocationId) {
    const location = await db
      .selectFrom("locations",)
      .select("id",)
      .where("id", "=", toLocationId,)
      .where("world_id", "=", worldId,)
      .executeTakeFirst();
    if (!location) { return { success: false, fromRemaining: source.quantity, toQuantity: 0, transferred: 0, }; }
  }
  const actualTransfer = Math.min(quantity, source.quantity,);
  const remaining = source.quantity - actualTransfer;
  if (remaining <= 0) {
    await db.deleteFrom("world_items",).where("id", "=", worldItemId,).where("world_id", "=", worldId,).execute();
  } else {
    await db
      .updateTable("world_items",)
      .set({ quantity: remaining, },)
      .where("id", "=", worldItemId,)
      .where("world_id", "=", worldId,)
      .execute();
  }

  if (toLocationId || toActorId) {
    let query = db
      .selectFrom("world_items",)
      .selectAll()
      .where("item_id", "=", source.item_id,)
      .where("world_id", "=", worldId,);
    if (toLocationId) { query = query.where("location_id", "=", toLocationId,); }
    if (toActorId) { query = query.where("owner_actor_id", "=", toActorId,); }
    const existing = await query.executeTakeFirst();
    if (existing) {
      await db
        .updateTable("world_items",)
        .set({ quantity: existing.quantity + actualTransfer, },)
        .where("id", "=", existing.id,)
        .where("world_id", "=", worldId,)
        .execute();
    } else {
      await db
        .insertInto("world_items",)
        .values({
          id: uid(),
          world_id: worldId,
          item_id: source.item_id,
          location_id: toLocationId ?? null,
          owner_actor_id: toActorId ?? null,
          quantity: actualTransfer,
          visibility: ItemVisibility.Visible,
          respawnable: 0,
          spawn_condition: null,
          properties: source.properties,
          max_durability: source.max_durability,
          current_durability: source.current_durability,
          is_active: source.is_active,
        },)
        .execute();
    }
  }
  return { success: true, fromRemaining: remaining, toQuantity: actualTransfer, transferred: actualTransfer, };
}

/**
 * Remove item instance. Requires worldId to prevent cross-world IDOR.
 * @param state
 * @param worldItemId
 * @param worldId
 * @param quantity
 * @param trx
 */
export async function destroy(
  state: ItemState,
  worldItemId: string,
  worldId: string,
  quantity?: number,
  trx?: Transaction<DB>,
): Promise<boolean> {
  const db = trx ?? state.db;

  if (quantity === undefined) {
    const result = await db.deleteFrom("world_items",).where("id", "=", worldItemId,).where("world_id", "=", worldId,)
      .execute();
    return (result[0]?.numDeletedRows ?? 0) > 0;
  }

  const source = await db
    .selectFrom("world_items",)
    .selectAll()
    .where("id", "=", worldItemId,)
    .where("world_id", "=", worldId,)
    .executeTakeFirst();

  if (!source) { return false; }

  const remaining = source.quantity - quantity;
  if (remaining <= 0) {
    await db.deleteFrom("world_items",).where("id", "=", worldItemId,).where("world_id", "=", worldId,).execute();
  } else {
    await db
      .updateTable("world_items",)
      .set({ quantity: remaining, },)
      .where("id", "=", worldItemId,)
      .execute();
  }

  return true;
}
