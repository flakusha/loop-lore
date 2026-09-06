// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { ErrorCode, HttpStatus, jsonError, } from "../http-utils";

/**
 * Validate a connections payload for a location in `worldId`: entries must be
 * location-id strings that exist in the world, and must not include the
 * location itself. Returns a BadRequest Response on the first violation, or
 * null when the payload is valid.
 * @param database
 * @param worldId
 * @param connections
 * @param excludeLocationId
 */
export async function validateConnections(
  database: Kysely<DB>,
  worldId: string,
  connections: unknown,
  excludeLocationId?: string,
): Promise<Response | null> {
  if (!Array.isArray(connections,)) { return null; }

  const connIds: string[] = [];
  for (const id of connections) {
    if (typeof id !== "string") {
      return jsonError({
        message: "connections must be an array of location id strings",
        status: HttpStatus.BadRequest,
        code: ErrorCode.ValidationError,
      },);
    }
    connIds.push(id,);
  }
  if (connIds.length === 0) { return null; }

  const existing = await database
    .selectFrom("locations",)
    .select("id",)
    .where("world_id", "=", worldId,)
    .where("id", "in", connIds,)
    .execute();
  const existingIds = new Set(Array.from(existing, (l,) => l.id,),);

  const missing: string[] = [];
  for (const id of connIds) {
    if (!existingIds.has(id,)) { missing.push(id,); }
  }
  if (missing.length > 0) {
    return jsonError({
      message: `Invalid connection locations: ${missing.join(", ",)}`,
      status: HttpStatus.BadRequest,
      code: ErrorCode.ValidationError,
    },);
  }

  if (excludeLocationId && connIds.includes(excludeLocationId,)) {
    return jsonError({
      message: "Location cannot connect to itself",
      status: HttpStatus.BadRequest,
      code: ErrorCode.ValidationError,
    },);
  }

  return null;
}
