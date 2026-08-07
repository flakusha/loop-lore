import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { linkAsset, } from "../../../assets/service";
import { AssetLinkEntity, } from "../../../db/enums-content";
import type { DB, } from "../../../db/schema";
import { jsonParseOr, jsonStringifyOr, } from "../../../utils";
import type { Avatar, CreateAvatarOpts, UpdateAvatarOpts, } from "./types";

/** Convert database row to Avatar object */
export function rowToAvatar(row: {
  id: string;
  actor_id: string;
  asset_id: string;
  label: string;
  tags: string;
  is_primary: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
},): Avatar {
  return {
    id: row.id,
    actorId: row.actor_id,
    assetId: row.asset_id,
    label: row.label,
    tags: jsonParseOr(row.tags, {},),
    isPrimary: row.is_primary === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Get all avatars for a character */
export async function getAvatars(db: Kysely<DB>, actorId: string,): Promise<Avatar[]> {
  const rows = await db
    .selectFrom("character_avatars",)
    .where("actor_id", "=", actorId,)
    .orderBy("sort_order", "asc",)
    .selectAll()
    .execute();

  return Array.from(rows, (row,) => rowToAvatar(row,),);
}

/** Get a specific avatar by ID */
export async function getAvatar(db: Kysely<DB>, avatarId: string,): Promise<Avatar | undefined> {
  const row = await db
    .selectFrom("character_avatars",)
    .where("id", "=", avatarId,)
    .selectAll()
    .executeTakeFirst();

  return row ? rowToAvatar(row,) : undefined;
}

/** Create a new avatar */
export async function createAvatar(db: Kysely<DB>, opts: CreateAvatarOpts,): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();

  // If setting as primary, unset other primaries
  if (opts.isPrimary) {
    await db
      .updateTable("character_avatars",)
      .set({ is_primary: 0, },)
      .where("actor_id", "=", opts.actorId,)
      .execute();
  }

  await db
    .insertInto("character_avatars",)
    .values({
      id,
      actor_id: opts.actorId,
      asset_id: opts.assetId,
      label: opts.label,
      tags: jsonStringifyOr(opts.tags ?? {},),
      is_primary: opts.isPrimary ? 1 : 0,
      sort_order: opts.sortOrder ?? 0,
      created_at: now,
      updated_at: now,
    },)
    .execute();

  // Link avatar asset to character actor for gallery visibility
  await linkAsset({
    database: db,
    assetId: opts.assetId,
    link: {
      entityType: AssetLinkEntity.Actor,
      entityId: opts.actorId,
      label: opts.isPrimary ? "avatar-primary" : "avatar",
    },
  },);

  return id;
}

/** Update an avatar */
export async function updateAvatar(
  db: Kysely<DB>,
  avatarId: string,
  opts: UpdateAvatarOpts,
): Promise<void> {
  const existing = await getAvatar(db, avatarId,);
  if (!existing) {
    throw new Error(`Avatar ${avatarId} not found`,);
  }

  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = {
    updated_at: now,
  };

  if (opts.label !== undefined) {
    updateData.label = opts.label;
  }
  if (opts.tags !== undefined) {
    updateData.tags = jsonStringifyOr(opts.tags,);
  }
  if (opts.isPrimary !== undefined) {
    if (opts.isPrimary) {
      // Unset other primaries
      await db
        .updateTable("character_avatars",)
        .set({ is_primary: 0, },)
        .where("actor_id", "=", existing.actorId,)
        .execute();
    }
    updateData.is_primary = opts.isPrimary ? 1 : 0;
  }
  if (opts.sortOrder !== undefined) {
    updateData.sort_order = opts.sortOrder;
  }

  await db
    .updateTable("character_avatars",)
    .set(updateData,)
    .where("id", "=", avatarId,)
    .execute();
}

/** Delete an avatar */
export async function deleteAvatar(db: Kysely<DB>, avatarId: string,): Promise<void> {
  await db
    .deleteFrom("character_avatars",)
    .where("id", "=", avatarId,)
    .execute();
}
