// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db";

/**
 * Get connected locations for pathfinding
 * Uses location_states table to find nearby locations
 * @param db
 * @param locationId
 */
export async function getLocationConnections(db: Kysely<DB>, locationId: string,): Promise<string[]> {
  // For now, get all locations in the same world
  // In a real implementation, this would use a connections table or spatial queries
  const location = await db
    .selectFrom("location_states",)
    .where("location_id", "=", locationId,)
    .select("world_id",)
    .executeTakeFirst();

  if (!location) { return []; }

  const nearbyLocations = await db
    .selectFrom("location_states",)
    .where("world_id", "=", location.world_id,)
    .where("location_id", "!=", locationId,)
    .select("location_id",)
    .limit(5,) // Limit to nearby locations
    .execute();

  const connections: string[] = [];
  for (const l of nearbyLocations) {
    if (l.location_id) { connections.push(l.location_id,); }
  }
  return connections;
}
