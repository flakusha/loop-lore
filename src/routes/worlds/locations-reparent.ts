// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { LocationMoveError, LocationTreeService, } from "../../locations";
import { HttpStatus, jsonError, } from "../http-utils";

/**
 * Reparent a location through LocationTreeService.moveSubtree. A raw
 * parent_location_id UPDATE could create a parent cycle, which wedges the
 * recursive-CTE path-rewrite trigger and stalls the whole DB.
 *
 * @param database
 * @param worldId world the moved location must live in
 * @param locId location being moved
 * @param parentId new parent id
 * @returns error Response, or null when the move succeeded
 * @throws {Error} unexpected moveSubtree failure (rethrown for the 500 path)
 */
export async function reparentLocation(
  database: Kysely<DB>,
  worldId: string,
  locId: string,
  parentId: string,
): Promise<Response | null> {
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
    await new LocationTreeService(database,).moveSubtree(locId, parentId,);
  } catch (error) {
    if (error instanceof LocationMoveError) {
      const status = error.code === "not-found" || error.code === "cross-world"
        ? HttpStatus.NotFound
        : HttpStatus.BadRequest;

      return jsonError({ message: error.message, status, },);
    }

    throw error;
  }

  return null;
}
