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
 */
export async function handleDeleteWorld(
  database: Kysely<DB>,
  worldId: string,
  userId: string | null,
  userRole: string | null,
) {
  const worldErr = await requireWorldOwner(database, worldId, userId, userRole,);
  if (worldErr) { return worldErr; }

  const locationIds = await database
    .selectFrom("locations",)
    .select("id",)
    .where("world_id", "=", worldId,)
    .execute();
  const locIds = Array.from(locationIds, (l,) => l.id,);
  if (locIds.length > 0) {
    await database.deleteFrom("location_states",).where("location_id", "in", locIds,).execute();
  }

  // Unlink chats bound to the world or any of its locations — chats survive
  // but lose their world/location binding (nullable FK columns, no cascade).
  if (locIds.length > 0) {
    await database
      .updateTable("chats",)
      .set({ current_location_id: null, },)
      .where("current_location_id", "in", locIds,)
      .execute();
  }
  await database
    .updateTable("chats",)
    .set({ world_id: null, },)
    .where("world_id", "=", worldId,)
    .execute();

  await database.deleteFrom("npc_states",).where("world_id", "=", worldId,).execute();
  await database.deleteFrom("world_states",).where("world_id", "=", worldId,).execute();
  await database.deleteFrom("world_lore_entries",).where("world_id", "=", worldId,).execute();

  const questIds = await database.selectFrom("quests",).select("id",).where("world_id", "=", worldId,).execute();
  const qIds = Array.from(questIds, (q,) => q.id,);
  if (qIds.length > 0) { await database.deleteFrom("quest_progress",).where("quest_id", "in", qIds,).execute(); }

  await database.deleteFrom("quests",).where("world_id", "=", worldId,).execute();
  await database.deleteFrom("world_items",).where("world_id", "=", worldId,).execute();
  await database.deleteFrom("items",).where("world_id", "=", worldId,).execute();
  await database
    .deleteFrom("asset_links",)
    .where("entity_type", "=", "world",)
    .where("entity_id", "=", worldId,)
    .execute();
  await database.deleteFrom("locations",).where("world_id", "=", worldId,).execute();
  await database.deleteFrom("worlds",).where("id", "=", worldId,).execute();
  return jsonNoContent();
}
