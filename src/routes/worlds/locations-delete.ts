// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonNoContent, } from "../http-utils";
import { requireWorldOwner, } from "./access";

/**
 * @param database
 * @param worldId
 * @param locId
 * @param userId
 * @param userRole
 */
export async function handleDeleteLocation(
  database: Kysely<DB>,
  worldId: string,
  locId: string,
  userId: string | null,
  userRole: string | null,
) {
  const worldErr = await requireWorldOwner(database, worldId, userId, userRole,);
  if (worldErr) { return worldErr; }

  // Unlink any chats bound to this location (auto-created public chat) — the
  // chats survive but are no longer location-bound (chats.current_location_id
  // and .world_id are nullable FK columns; no ON DELETE CASCADE exists).
  await database
    .updateTable("chats",)
    .set({ current_location_id: null, },)
    .where("current_location_id", "=", locId,)
    .execute();

  // location_states rows hold an FK to locations.id without ON DELETE CASCADE —
  // delete them first or the location delete violates the FK (500).
  await database.deleteFrom("location_states",).where("location_id", "=", locId,).execute();

  await database.deleteFrom("locations",).where("id", "=", locId,).where("world_id", "=", worldId,).execute();
  return jsonNoContent();
}
