// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { LocationMoveError, LocationTreeService, } from "../../locations";
import { HttpStatus, jsonError, jsonResponse, } from "../http-utils";
import { requireWorldOwner, } from "./access";

/**
 * Move a location (and its subtree) under a new parent via
 * LocationTreeService.moveSubtree, which rejects self-parents, cycles and
 * cross-world parents at the application layer. A raw parent_location_id
 * UPDATE would bypass those checks and can wedge the recursive-CTE
 * path-rewrite trigger.
 *
 * @param database
 * @param worldId world the moved location must live in
 * @param locId location being moved
 * @param newParentId new parent id, or null to make the location a root
 * @param userId
 * @param userRole
 * @returns {Promise<Response>}
 */
export async function handleMoveLocation(
  database: Kysely<DB>,
  worldId: string,
  locId: string,
  newParentId: string | null,
  userId: string | null,
  userRole: string | null,
) {
  const worldErr = await requireWorldOwner(database, worldId, userId, userRole,);
  if (worldErr) { return worldErr; }

  const loc = await database
    .selectFrom("locations",)
    .where("id", "=", locId,)
    .where("world_id", "=", worldId,)
    .select("id",)
    .executeTakeFirst();

  if (!loc) {
    return jsonError({ message: "Location not found", status: HttpStatus.NotFound, },);
  }

  try {
    await new LocationTreeService(database,).moveSubtree(locId, newParentId,);
  } catch (error) {
    if (error instanceof LocationMoveError) {
      // Cycle/self-parent/cross-world are client errors (400); only a truly
      // missing row is a 404.
      const status = error.code === "not-found" ? HttpStatus.NotFound : HttpStatus.BadRequest;

      return jsonError({ message: error.message, status, },);
    }

    throw error;
  }

  return jsonResponse({ ok: true, },);
}
