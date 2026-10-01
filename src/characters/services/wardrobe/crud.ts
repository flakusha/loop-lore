// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { DB, } from "../../../db/schema";
import { jsonParseOr, jsonStringifyOr, } from "../../../utils";
import type {
  CreateWardrobeItemOpts,
  UpdateWardrobeItemOpts,
  WardrobeItem,
} from "./types";

function rowToItem(row: {
  id: string;
  actor_id: string | null;
  world_id: string | null;
  name: string;
  descriptor: string;
  tags: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
},): WardrobeItem {
  return {
    id: row.id,
    actorId: row.actor_id,
    worldId: row.world_id,
    name: row.name,
    descriptor: row.descriptor,
    tags: jsonParseOr<string[]>(row.tags, [],),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * List wardrobe items visible to one actor: their personal items plus
 * world templates of the given world (when worldId is provided).
 * @param db
 * @param actorId
 * @param opts
 * @param opts.worldId
 * @returns void
 */
export async function listWardrobeItems(
  db: Kysely<DB>,
  actorId: string,
  opts: { worldId?: string } = {},
): Promise<WardrobeItem[]> {
  const rows = await db
    .selectFrom("wardrobe_items",)
    .where((eb,) =>
      eb.or([
        eb("actor_id", "=", actorId,),
        ...(opts.worldId ? [eb("world_id", "=", opts.worldId,),] : []),
      ],)
    )
    .orderBy("sort_order", "asc",)
    .selectAll()
    .execute();

  return Array.from(rows, (row,) => rowToItem(row,),);
}

/**
 * Get one wardrobe item, scoped to its owning actor or world.
 * @param db
 * @param itemId
 * @param actorId
 * @param worldId
 * @returns void
 */
export async function getWardrobeItem(
  db: Kysely<DB>,
  itemId: string,
  actorId: string,
  worldId?: string,
): Promise<WardrobeItem | undefined> {
  const row = await db
    .selectFrom("wardrobe_items",)
    .where("id", "=", itemId,)
    .selectAll()
    .executeTakeFirst();
  if (!row) { return; }
  // Resource-level authorization: personal items only for their owner,
  // world templates only within the caller's world.
  const owned = row.actor_id === actorId || (!!worldId && row.world_id === worldId);
  return owned ? rowToItem(row,) : undefined;
}

/**
 * Create a wardrobe item. Exactly one scope must resolve: personal items
 * require actorId; world templates require worldId.
 * @param db
 * @param opts
 * @returns void
 * @throws {Error} when neither scope is provided
 */
export async function createWardrobeItem(
  db: Kysely<DB>,
  opts: CreateWardrobeItemOpts,
): Promise<string> {
  if (!opts.actorId && !opts.worldId) {
    throw new Error("Wardrobe item requires an actor or world scope",);
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  await db
    .insertInto("wardrobe_items",)
    .values({
      id,
      actor_id: opts.actorId ?? null,
      world_id: opts.worldId ?? null,
      name: opts.name,
      descriptor: opts.descriptor ?? "",
      tags: jsonStringifyOr(opts.tags ?? [],),
      sort_order: opts.sortOrder ?? 0,
      created_at: now,
      updated_at: now,
    },)
    .execute();
  return id;
}

/**
 * Update a wardrobe item. Returns false when the row is missing or the
 * caller does not own it (resource-level authorization).
 * @param db
 * @param itemId
 * @param actorId
 * @param opts
 * @returns void
 */
export async function updateWardrobeItem(
  db: Kysely<DB>,
  itemId: string,
  actorId: string,
  opts: UpdateWardrobeItemOpts,
): Promise<boolean> {
  const existing = await getWardrobeItem(db, itemId, actorId,);
  if (!existing) { return false; }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), };
  if (opts.name !== undefined) { patch.name = opts.name; }
  if (opts.descriptor !== undefined) { patch.descriptor = opts.descriptor; }
  if (opts.tags !== undefined) { patch.tags = jsonStringifyOr(opts.tags,); }
  if (opts.sortOrder !== undefined) { patch.sort_order = opts.sortOrder; }

  await db.updateTable("wardrobe_items",).set(patch,).where("id", "=", itemId,).execute();
  return true;
}

/**
 * Delete a wardrobe item after verifying the caller owns it.
 * Cascades: bindings, chat overrides, and avatar outfit refs are cleared.
 * @param db
 * @param itemId
 * @param actorId
 * @returns void
 */
export async function deleteWardrobeItem(
  db: Kysely<DB>,
  itemId: string,
  actorId: string,
): Promise<boolean> {
  const existing = await getWardrobeItem(db, itemId, actorId,);
  if (!existing) { return false; }
  await db.deleteFrom("wardrobe_items",).where("id", "=", itemId,).execute();
  return true;
}
