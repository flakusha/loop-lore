// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { DB, } from "../../../db/schema";
import { getWardrobeItem, } from "./crud";
import type { WardrobeBinding, } from "./types";

/**
 * Bind an inventory item instance into an outfit (the actor's wardrobe).
 * The instance must belong to the same actor — inventory integration,
 * not a parallel item model.
 * @param db
 * @param actorId
 * @param wardrobeItemId
 * @param itemInstanceId
 * @returns void
 * @throws {Error} when the instance is not in the actor's inventory or the outfit is not visible to the actor
 */
export async function bindWardrobeItemInstance(
  db: Kysely<DB>,
  actorId: string,
  wardrobeItemId: string,
  itemInstanceId: string,
): Promise<string> {
  const outfit = await getWardrobeItem(db, wardrobeItemId, actorId,);
  if (!outfit) { throw new Error("Wardrobe item not found",); }

  const instance = await db
    .selectFrom("actor_items",)
    .select(["id",],)
    .where("id", "=", itemInstanceId,)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();
  if (!instance) { throw new Error("Item instance not found in actor inventory",); }

  const existing = await db
    .selectFrom("actor_wardrobe",)
    .select(["id",],)
    .where("actor_id", "=", actorId,)
    .where("wardrobe_item_id", "=", wardrobeItemId,)
    .where("item_instance_id", "=", itemInstanceId,)
    .executeTakeFirst();
  if (existing) { return existing.id; }

  const id = randomUUID();
  await db
    .insertInto("actor_wardrobe",)
    .values({
      id,
      actor_id: actorId,
      wardrobe_item_id: wardrobeItemId,
      item_instance_id: itemInstanceId,
      created_at: new Date().toISOString(),
    },)
    .execute();
  return id;
}

/**
 * Remove an instance binding. Scoped to the actor (row-level authz).
 * @param db
 * @param actorId
 * @param bindingId
 * @returns void
 */
export async function unbindWardrobeItemInstance(
  db: Kysely<DB>,
  actorId: string,
  bindingId: string,
): Promise<boolean> {
  const result = await db
    .deleteFrom("actor_wardrobe",)
    .where("id", "=", bindingId,)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();
  return Number(result.numDeletedRows ?? 0,) > 0;
}

/**
 * List instance bindings for one outfit.
 * @param db
 * @param actorId
 * @param wardrobeItemId
 * @returns void
 */
export async function listWardrobeBindings(
  db: Kysely<DB>,
  actorId: string,
  wardrobeItemId: string,
): Promise<WardrobeBinding[]> {
  const rows = await db
    .selectFrom("actor_wardrobe",)
    .where("actor_id", "=", actorId,)
    .where("wardrobe_item_id", "=", wardrobeItemId,)
    .selectAll()
    .execute();

  return Array.from(rows, (row,) => ({
    id: row.id,
    actorId: row.actor_id,
    wardrobeItemId: row.wardrobe_item_id,
    itemInstanceId: row.item_instance_id,
    createdAt: row.created_at,
  }),);
}
