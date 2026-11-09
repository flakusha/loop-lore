// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Fast-travel unlock gate — the single server-side check behind instant chat
 * travel (`PUT /chats/:id/location`).
 *
 * Model (no new tables): a destination is LOCKED for a caller when at least
 * one `location_edges` row points at it with `requires_discovery = 1` and the
 * caller's actor set carries no `location_discovery` latch (`discovered = 1`)
 * for that destination. Locations with no gated inbound edge are open to
 * everyone, so worlds without any discovery edges behave exactly as before.
 *
 * Privilege bypass: the world owner and `admin.world` holders travel freely
 * (same bypass the adjacency hop grants in `EdgeTravelService.travel`).
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";

/**
 * Actor ids owned by a user (persona actors; adopted actors resolve through
 * the same column). Empty when the caller has no actor to travel with.
 * @param database Kysely handle
 * @param userId owning user
 * @returns actor ids for that user
 */
async function actorIdsForUser(database: Kysely<DB>, userId: string,): Promise<string[]> {
  const rows = await database
    .selectFrom("actors",)
    .select("id",)
    .where("user_id", "=", userId,)
    .execute();

  return rows.map((r,) => r.id);
}

/**
 * Whether the destination is locked for this caller.
 * @param database Kysely handle
 * @param params world, destination and caller
 * @param params.worldId owning world
 * @param params.destinationId candidate fast-travel target
 * @param params.userId traveling user
 * @param params.isPrivileged world owner / admin bypass (travels freely)
 * @returns true when travel must be rejected with 403
 */
export async function isFastTravelLocked(
  database: Kysely<DB>,
  params: { worldId: string; destinationId: string; userId: string; isPrivileged: boolean },
): Promise<boolean> {
  const { worldId, destinationId, userId, isPrivileged, } = params;
  if (isPrivileged) { return false; }

  const gated = await database
    .selectFrom("location_edges",)
    .select("id",)
    .where("world_id", "=", worldId,)
    .where("to_id", "=", destinationId,)
    .where("requires_discovery", "=", 1,)
    .executeTakeFirst();

  if (!gated) { return false; }

  const actorIds = await actorIdsForUser(database, userId,);
  if (actorIds.length === 0) { return true; }

  const latched = await database
    .selectFrom("location_discovery",)
    .select("location_id",)
    .where("world_id", "=", worldId,)
    .where("location_id", "=", destinationId,)
    .where("actor_id", "in", actorIds,)
    .where("discovered", "=", 1,)
    .executeTakeFirst();

  return !latched;
}
