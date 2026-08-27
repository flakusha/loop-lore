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
import { safeJsonStringify, uid, } from "../../utils";
import type { ItemState, TransferResult, } from "./types";

/** Place item instance in a location */
export async function placeInLocation(
  state: ItemState,
  itemId: string,
  locationId: string,
  worldId: string,
  quantity = 1,
  hidden = false,
  respawnable = false,
  spawnCondition?: Record<string, unknown>,
): Promise<string> {
  const id = uid();
  await state.db
    .insertInto("world_items",)
    .values({
      id,
      world_id: worldId,
      item_id: itemId,
      location_id: locationId,
      quantity,
      visibility: hidden ? ItemVisibility.Hidden : ItemVisibility.Visible,
      respawnable: respawnable ? 1 : 0,
      spawn_condition: spawnCondition
        ? (() => {
          const r = safeJsonStringify(spawnCondition,);
          return r.ok ? r.value : null;
        })()
        : null,
    },)
    .execute();
  return id;
}

/** Give item instance to an NPC */
export async function giveToNpc(
  state: ItemState,
  itemId: string,
  actorId: string,
  worldId: string,
  quantity = 1,
): Promise<string> {
  const id = uid();
  await state.db
    .insertInto("world_items",)
    .values({
      id,
      world_id: worldId,
      item_id: itemId,
      owner_actor_id: actorId,
      quantity,
      location_id: null,
      visibility: ItemVisibility.Visible,
      respawnable: 0,
      spawn_condition: null,
    },)
    .execute();
  return id;
}

/** Get items at a location */
export async function getAtLocation(state: ItemState, locationId: string, includeHidden = false,) {
  let query = state.db
    .selectFrom("world_items",)
    .innerJoin("items", "items.id", "world_items.item_id",)
    .select([
      "world_items.id as world_item_id",
      "world_items.item_id",
      "world_items.quantity",
      "world_items.visibility",
      "world_items.location_id",
      "world_items.owner_actor_id",
      "items.name",
      "items.description",
      "items.category",
      "items.rarity",
      "items.properties",
      "items.value",
      "items.weight",
    ],)
    .where("world_items.location_id", "=", locationId,);

  if (!includeHidden) {
    query = query.where("world_items.visibility", "=", "visible",);
  }

  return query.execute();
}

export { getNpcInventory, } from "./npc-inventory";

/** Transfer items between locations, NPCs, or from world to actor. Requires worldId to prevent cross-world IDOR. */
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

  if (!source) {
    return { success: false, fromRemaining: 0, toQuantity: 0, transferred: 0, };
  }

  const actualTransfer = Math.min(quantity, source.quantity,);
  const remaining = source.quantity - actualTransfer;

  if (remaining <= 0) {
    // Transfer all — delete the source row (no zero-quantity orphans).
    await db
      .deleteFrom("world_items",)
      .where("id", "=", worldItemId,)
      .execute();
  } else {
    // Partial — reduce source
    await db
      .updateTable("world_items",)
      .set({ quantity: remaining, },)
      .where("id", "=", worldItemId,)
      .execute();
  }

  // Create or add to destination
  if (toLocationId || toActorId) {
    let query = db
      .selectFrom("world_items",)
      .selectAll()
      .where("item_id", "=", source.item_id,)
      .where("world_id", "=", worldId,);

    if (toLocationId) {
      query = query.where("location_id", "=", toLocationId,);
    } else if (toActorId) {
      query = query.where("owner_actor_id", "=", toActorId,);
    }

    const existing = await query.executeTakeFirst();

    if (existing) {
      await db
        .updateTable("world_items",)
        .set({ quantity: existing.quantity + actualTransfer, },)
        .where("id", "=", existing.id,)
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
        },)
        .execute();
    }
  }

  return {
    success: true,
    fromRemaining: remaining,
    toQuantity: actualTransfer,
    transferred: actualTransfer,
  };
}

/** Remove item instance. Requires worldId to prevent cross-world IDOR. */
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
    return result.length > 0 && (result[0]?.numDeletedRows ?? 0) > 0;
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
