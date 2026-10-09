// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type Kysely, sql, } from "kysely";
import { randomUUID, } from "node:crypto";
import { LocationEdgeMode, } from "../db/enums-story/world";
import type { DB, } from "../db/schema";
import { jsonStringifyOr, } from "../utils/safe-json";
import { LocationEdgeError, sqlStamp, } from "./edge-core";
import type { EdgeRow, } from "./edge-graph";

/**
 * The world graph. When `actorId` is given, edges flagged
 * `requires_discovery` are hidden unless BOTH endpoints carry that
 * actor's discovery latch (041 location_discovery.discovered).
 * @param db Kysely handle
 * @param worldId world to read
 * @param actorId optional viewer actor for discovery filtering
 * @returns {Promise<EdgeRow[]>} visible edges ordered by origin
 */
export async function worldGraph(db: Kysely<DB>, worldId: string, actorId?: string | null,): Promise<EdgeRow[]> {
  const edges = await db
    .selectFrom("location_edges",)
    .selectAll()
    .where("world_id", "=", worldId,)
    .orderBy("from_id", "asc",)
    .execute();

  const gated = edges.filter((e,) => e.requires_discovery === 1);
  if (gated.length === 0 || !actorId) { return edges; }

  const discovered = await db
    .selectFrom("location_discovery",)
    .select("location_id",)
    .where("world_id", "=", worldId,)
    .where("actor_id", "=", actorId,)
    .where("discovered", "=", 1,)
    .execute();

  const seen = new Set(discovered.map((d,) => d.location_id),);

  return edges.filter(
    (e,) => e.requires_discovery !== 1 || (seen.has(e.from_id,) && seen.has(e.to_id,)),
  );
}

/**
 * Admin force-unlock: latch discovery for one (actor, location) pair.
 * @param db Kysely handle
 * @param worldId world
 * @param locationId location to latch
 * @param actorId actor gaining the visit record
 * @throws {LocationEdgeError} "not-found" when the location is absent
 */
export async function forceDiscover(
  db: Kysely<DB>,
  worldId: string,
  locationId: string,
  actorId: string,
): Promise<void> {
  const loc = await db
    .selectFrom("locations",)
    .select("id",)
    .where("id", "=", locationId,)
    .where("world_id", "=", worldId,)
    .executeTakeFirst();

  if (!loc) {
    throw new LocationEdgeError("not-found", "Location not found",);
  }

  await latchDiscovered(db, worldId, locationId, actorId,);
}

/**
 * Upsert the discovery latch for one (world, location, actor).
 * @param db Kysely handle
 * @param worldId world
 * @param locationId visited location
 * @param actorId visiting actor
 */
export async function latchDiscovered(
  db: Kysely<DB>,
  worldId: string,
  locationId: string,
  actorId: string,
): Promise<void> {
  await db
    .insertInto("location_discovery",)
    .values({
      world_id: worldId,
      location_id: locationId,
      actor_id: actorId,
      progress: 100,
      discovered: 1,
      updated_at: sqlStamp(new Date(),),
    },)
    .onConflict((oc,) =>
      oc.columns(["world_id", "location_id", "actor_id",],).doUpdateSet({
        discovered: 1,
        updated_at: sqlStamp(new Date(),),
      },)
    )
    .execute();
}

/**
 * Record a hop in the append-only world event log — the free-jump
 * cooldown source of truth.
 * @param db Kysely handle
 * @param worldId world
 * @param edgeId edge used
 * @param actorId traveling actor
 * @param mode traversal mode
 * @param fromId origin
 * @param toId destination
 */
export async function recordHop(
  db: Kysely<DB>,
  worldId: string,
  edgeId: string,
  actorId: string,
  mode: string,
  fromId: string,
  toId: string,
): Promise<void> {
  await db
    .insertInto("world_event_log",)
    .values({
      world_id: worldId,
      event_type: mode === LocationEdgeMode.FreeJump ? "location:free_jump" : "location:travel",
      subject_id: edgeId,
      actor_id: actorId,
      payload: jsonStringifyOr({ from: fromId, to: toId, mode, },),
      tick_index: 0,
      dedupe_key: `edge-travel:${randomUUID()}`,
    },)
    .execute();
}

/**
 * True when this actor used this edge within the last `hours` hours.
 * @param db Kysely handle
 * @param worldId world
 * @param edgeId edge to throttle
 * @param actorId acting actor
 * @param hours cooldown window in hours
 * @returns {Promise<boolean>} whether the actor is still cooling down
 */
export async function freeJumpOnCooldown(
  db: Kysely<DB>,
  worldId: string,
  edgeId: string,
  actorId: string,
  hours: number,
): Promise<boolean> {
  const window = `-${hours} hours`;
  const recent = await db
    .selectFrom("world_event_log",)
    .select("id",)
    .where("world_id", "=", worldId,)
    .where("event_type", "=", "location:free_jump",)
    .where("subject_id", "=", edgeId,)
    .where("actor_id", "=", actorId,)
    .where(sql<boolean>`created_at > datetime('now', ${window})`,)
    .executeTakeFirst();

  return recent !== undefined;
}
