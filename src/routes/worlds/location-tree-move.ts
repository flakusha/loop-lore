// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared plumbing for the two location-move HTTP paths (move + reparent):
 * world-scoped row loading and moveSubtree error mapping. Both routes must
 * go through LocationTreeService.moveSubtree — a raw parent_location_id
 * UPDATE can create a parent cycle, which wedges the recursive-CTE
 * path-rewrite trigger and stalls the whole DB.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { LocationMoveError, LocationTreeService, } from "../../locations";
import { HttpStatus, jsonError, } from "../http-utils";

/**
 * Load a location id scoped to its world.
 * @param database
 * @param worldId world the location must live in
 * @param locId location being looked up
 * @returns the row id, or null when no such location exists in the world
 */
async function loadWorldLocationId(
  database: Kysely<DB>,
  worldId: string,
  locId: string,
): Promise<string | null> {
  const loc = await database
    .selectFrom("locations",)
    .where("id", "=", locId,)
    .where("world_id", "=", worldId,)
    .select("id",)
    .executeTakeFirst();

  return loc?.id ?? null;
}

/**
 * Move a location subtree through LocationTreeService, mapping
 * LocationMoveError codes to HTTP error responses. A raw
 * parent_location_id UPDATE can create a parent cycle, which wedges the
 * recursive-CTE path-rewrite trigger and stalls the whole DB — every HTTP
 * move path must go through here.
 * @param database
 * @param worldId world the moved location must live in
 * @param locId location being moved
 * @param newParentId new parent id
 * @param notFoundCodes move error codes that map to 404 (the rest map to 400)
 * @returns error Response, or null when the move succeeded
 * @throws {Error} unexpected moveSubtree failure (rethrown for the 500 path)
 */
export async function moveLocationOrError(
  database: Kysely<DB>,
  worldId: string,
  locId: string,
  newParentId: string | null,
  notFoundCodes: LocationMoveError["code"][],
): Promise<Response | null> {
  const foundId = await loadWorldLocationId(database, worldId, locId,);
  if (foundId === null) {
    return jsonError({ message: "Location not found", status: HttpStatus.NotFound, },);
  }

  try {
    await new LocationTreeService(database,).moveSubtree(foundId, newParentId,);
  } catch (error) {
    if (error instanceof LocationMoveError) {
      // Only the configured codes read as "absent" (404); every other move
      // rejection is a client error (400).
      const notFound = notFoundCodes.includes(error.code,);

      return jsonError({
        message: error.message,
        status: notFound ? HttpStatus.NotFound : HttpStatus.BadRequest,
      },);
    }

    throw error;
  }

  return null;
}
