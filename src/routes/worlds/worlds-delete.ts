// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonNoContent, } from "../http-utils";
import { requireWorldOwner, } from "./access";

/**
 * @param database
 * @param worldId
 * @param userId
 * @param userRole
 * @returns {Promise<Response>}
 */
export async function handleDeleteWorld(
  database: Kysely<DB>,
  worldId: string,
  userId: string | null,
  userRole: string | null,
) {
  const worldErr = await requireWorldOwner(database, worldId, userId, userRole,);
  if (worldErr) { return worldErr; }

  // All-or-nothing teardown
  // (BUG-world-delete-untransactioned-missing-travel-cleanup-fk-500-h): the
  // plain-await version FK-500ed mid-way on any world with travel routes or
  // actor positions, leaving a half-deleted world. One transaction covers the
  // whole teardown; a failure rolls everything back.
  return database.transaction().execute(async (trx,) => {
    const locationIds = await trx
      .selectFrom("locations",)
      .select("id",)
      .where("world_id", "=", worldId,)
      .execute();

    const locIds = Array.from(locationIds, (l,) => l.id,);
    if (locIds.length > 0) {
      await trx.deleteFrom("location_states",).where("location_id", "in", locIds,).execute();
    }

    // Travel teardown: stops reference routes (cascade) AND locations (no
    // action), routes reference the world (no action) — both must go before
    // locations/worlds.
    await trx
      .deleteFrom("travel_route_stops",)
      .where("route_id", "in", (eb,) =>
        eb.selectFrom("travel_routes",)
          .select("id",)
          .where("world_id", "=", worldId,),)
      .execute();

    await trx.deleteFrom("travel_routes",).where("world_id", "=", worldId,).execute();

    // Actor positions reference locations with no ON DELETE action.
    if (locIds.length > 0) {
      await trx
        .deleteFrom("actor_locations",)
        .where((eb,) =>
          eb.or([
            eb("physical_location_id", "in", locIds,),
            eb("spatial_location_id", "in", locIds,),
          ],)
        )
        .execute();
    }

    // Unlink chats bound to the world or any of its locations — chats survive
    // but lose their world/location binding (nullable FK columns, no cascade).
    if (locIds.length > 0) {
      await trx
        .updateTable("chats",)
        .set({ current_location_id: null, },)
        .where("current_location_id", "in", locIds,)
        .execute();
    }

    await trx
      .updateTable("chats",)
      .set({ world_id: null, },)
      .where("world_id", "=", worldId,)
      .execute();

    if (locIds.length > 0) {
      // Nested locations: the self-reference has no ON DELETE action, so a
      // child row still pointing at a not-yet-deleted parent would abort the
      // locations delete. Children are being deleted too — release the link.
      await trx
        .updateTable("locations",)
        .set({ parent_location_id: null, },)
        .where("parent_location_id", "in", locIds,)
        .execute();

      // Historical interaction logs keep their rows but lose the location
      // binding (same policy as the chat unlink above).
      await trx
        .updateTable("interaction_logs",)
        .set({ location_id: null, },)
        .where("location_id", "in", locIds,)
        .execute();
    }

    // interaction_logs.world_id is also a no-action FK — release it for the
    // world even when no location rows exist.
    await trx
      .updateTable("interaction_logs",)
      .set({ world_id: null, },)
      .where("world_id", "=", worldId,)
      .execute();

    await trx.deleteFrom("npc_states",).where("world_id", "=", worldId,).execute();
    await trx.deleteFrom("world_states",).where("world_id", "=", worldId,).execute();
    await trx.deleteFrom("world_lore_entries",).where("world_id", "=", worldId,).execute();

    const questIds = await trx.selectFrom("quests",).select("id",).where("world_id", "=", worldId,).execute();
    const qIds = Array.from(questIds, (q,) => q.id,);
    if (qIds.length > 0) { await trx.deleteFrom("quest_progress",).where("quest_id", "in", qIds,).execute(); }

    await trx.deleteFrom("quests",).where("world_id", "=", worldId,).execute();
    await trx.deleteFrom("world_items",).where("world_id", "=", worldId,).execute();
    await trx.deleteFrom("items",).where("world_id", "=", worldId,).execute();
    await trx
      .deleteFrom("asset_links",)
      .where("entity_type", "=", "world",)
      .where("entity_id", "=", worldId,)
      .execute();

    await trx.deleteFrom("locations",).where("world_id", "=", worldId,).execute();
    await trx.deleteFrom("worlds",).where("id", "=", worldId,).execute();
    return jsonNoContent();
  },);
}
