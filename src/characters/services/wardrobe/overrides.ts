// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Outfit override writers — chat/scene override and location rule map.
 * Reads live in `resolve.ts`; the route layer authorizes the chat/world
 * (checkChatAccess / world membership) before calling these.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { jsonStringifyOr, } from "../../../utils";

/**
 * Set (or clear, with outfitId null) the chat/scene outfit override.
 * The outfit must be visible to the actor.
 * @param db
 * @param opts
 * @param opts.chatId
 * @param opts.actorId
 * @param opts.outfitId
 * @param opts.changedBy
 * @returns void
 * @throws {Error} when the outfit is not visible to the actor
 */
export async function setChatOutfitOverride(
  db: Kysely<DB>,
  opts: { chatId: string; actorId: string; outfitId: string | null; changedBy?: string },
): Promise<void> {
  const now = new Date().toISOString();
  // Local const: property narrowing does not survive into the onConflict
  // closure below.
  const outfitId = opts.outfitId;

  if (outfitId === null) {
    await db
      .deleteFrom("chat_wardrobe_overrides",)
      .where("chat_id", "=", opts.chatId,)
      .where("actor_id", "=", opts.actorId,)
      .execute();

    return;
  }

  const outfit = await db
    .selectFrom("wardrobe_items",)
    .select(["id",],)
    .where("id", "=", outfitId,)
    .where((eb,) => eb.or([eb("actor_id", "=", opts.actorId,), eb("actor_id", "is", null,),],))
    .executeTakeFirst();

  if (!outfit) { throw new Error("Wardrobe item not found",); }

  await db
    .insertInto("chat_wardrobe_overrides",)
    .values({
      id: crypto.randomUUID(),
      chat_id: opts.chatId,
      actor_id: opts.actorId,
      outfit_id: outfitId,
      changed_by: opts.changedBy ?? null,
      created_at: now,
      updated_at: now,
    },)
    .onConflict((oc,) =>
      oc.columns(["chat_id", "actor_id",],).doUpdateSet({
        outfit_id: outfitId,
        changed_by: opts.changedBy,
        updated_at: now,
      },)
    )
    .execute();
}

/**
 * Replace the location→outfit rule map for one actor in one world.
 * @param db
 * @param opts
 * @param opts.worldId
 * @param opts.actorId
 * @param opts.bindings
 * @returns void
 * @throws {Error} when a referenced outfit is not visible in the world
 */
export async function setLocationOutfitBindings(
  db: Kysely<DB>,
  opts: { worldId: string; actorId: string; bindings: Record<string, string> },
): Promise<void> {
  for (const outfitId of Object.values(opts.bindings,)) {
    const visible = await db
      .selectFrom("wardrobe_items",)
      .select(["id",],)
      .where("id", "=", outfitId,)
      .where((eb,) =>
        eb.or([
          eb("actor_id", "=", opts.actorId,),
          eb("world_id", "=", opts.worldId,),
        ],)
      )
      .executeTakeFirst();

    if (!visible) { throw new Error(`Wardrobe item ${outfitId} not visible in world`,); }
  }

  const now = new Date().toISOString();
  const serialized = jsonStringifyOr(opts.bindings,);
  const existing = await db
    .selectFrom("world_avatar_config",)
    .select(["id",],)
    .where("world_id", "=", opts.worldId,)
    .where("actor_id", "=", opts.actorId,)
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable("world_avatar_config",)
      .set({ outfit_bindings: serialized, updated_at: now, },)
      .where("id", "=", existing.id,)
      .execute();

    return;
  }

  await db
    .insertInto("world_avatar_config",)
    .values({
      id: crypto.randomUUID(),
      world_id: opts.worldId,
      actor_id: opts.actorId,
      selection_rule_override: null,
      weights_override: null,
      outfit_bindings: serialized,
      created_at: now,
      updated_at: now,
    },)
    .execute();
}
