// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World delete teardown (BUG-world-delete-untransactioned-missing-travel-cleanup-fk-500-h):
 *
 * The teardown used to run as plain awaits with no transaction and no cleanup
 * for travel_routes / travel_route_stops / actor_locations (FKs without ON
 * DELETE CASCADE) — any world with a travel route or an actor position
 * FK-500ed AFTER npc_states/world_states/quests were already gone, leaving a
 * half-deleted world. Tests drive the real handler against a migrated test DB
 * (foreign_keys ON) and assert the delete completes and clears every row.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { sql, } from "kysely";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertLocations,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { handleDeleteWorld, } from "./worlds-delete";

let db: Kysely<DB>;
let ownerId: string;
let actorId: string;

beforeAll(async () => {
  ({ db, } = await createTestDb());
  ownerId = await insertUsers(db, `wd-${crypto.randomUUID()}`, "WD",);
  actorId = await insertActors(db, "WD Actor", { user_id: ownerId, owner_id: ownerId, },);
},);

afterAll(async () => {
  await db.destroy();
},);

interface SeedResult {
  worldId: string;
  locA: string;
  locChild: string;
  routeId: string;
}

/** World with two locations (one nested), a route with a stop, an actor position. */
async function seedWorldWithTravel(): Promise<SeedResult> {
  const worldId = await insertWorlds(db, ownerId, `WD World ${uid()}`,);
  const locA = await insertLocations(db, worldId, "Crossroads",);
  const locChild = await insertLocations(db, worldId, "Side Alley", { parent_location_id: locA, },);

  const routeId = uid();
  await db.insertInto("travel_routes",).values({
    id: routeId,
    world_id: worldId,
    name: "Main Road",
    kind: "road",
  },).execute();

  await db.insertInto("travel_route_stops",).values({
    id: uid(),
    route_id: routeId,
    location_id: locA,
    stop_order: 0,
  },).execute();

  await db.insertInto("actor_locations",).values({
    actor_id: actorId,
    physical_location_id: locA,
    spatial_location_id: locA,
  },).execute();

  return { worldId, locA, locChild, routeId, };
}

async function count(db2: Kysely<DB>, table: string, column: string, id: string,): Promise<number> {
  try {
    const rows = await sql<{ n: number }>`
      SELECT COUNT(*) AS n FROM ${sql.table(table,)} WHERE ${sql.ref(column,)} = ${id}
    `.execute(db2,);

    return rows.rows[0]?.n ?? 0;
  } catch (e) {
    throw new Error(`count(${table}) failed: ${(e as Error).message}`,);
  }
}

/** Rows in a world-scoped table for one world. */
function countWorld(db2: Kysely<DB>, table: string, worldId: string,): Promise<number> {
  return table === "worlds" ? count(db2, table, "id", worldId,) : count(db2, table, "world_id", worldId,);
}

describe("handleDeleteWorld teardown", () => {
  test("a world with travel routes and actor positions deletes fully", async () => {
    const { worldId, routeId, } = await seedWorldWithTravel();

    const res = await handleDeleteWorld(db, worldId, ownerId, "admin",);
    expect(res.status,).toBe(204,);

    expect(await countWorld(db, "worlds", worldId,),).toBe(0,);
    expect(await countWorld(db, "locations", worldId,),).toBe(0,);
    expect(await countWorld(db, "travel_routes", worldId,),).toBe(0,);

    const stops = await db
      .selectFrom("travel_route_stops",)
      .select("id",)
      .where("route_id", "=", routeId,)
      .execute();

    expect(stops,).toHaveLength(0,);

    const positions = await db
      .selectFrom("actor_locations",)
      .select("actor_id",)
      .where("actor_id", "=", actorId,)
      .execute();

    expect(positions,).toHaveLength(0,);
  });

  test("nested locations and pinned interaction logs do not block the delete", async () => {
    const worldId = await insertWorlds(db, ownerId, `WD World ${uid()}`,);
    const parent = await insertLocations(db, worldId, "Keep",);
    await insertLocations(db, worldId, "Courtyard", { parent_location_id: parent, },);

    // interaction_logs.location_id → locations.id with no ON DELETE action.
    const chatId = await insertChats(db, "WD Chat", ownerId, { world_id: worldId, },);
    await db.insertInto("interaction_logs",).values({
      id: uid(),
      chat_id: chatId,
      world_id: worldId,
      actor_id: actorId,
      location_id: parent,
      command: "look",
      category: "movement" as never,
      skill: "none",
      difficulty: 0,
      outcome: "success",
    },).execute();

    const res = await handleDeleteWorld(db, worldId, ownerId, "admin",);
    expect(res.status,).toBe(204,);
    expect(await countWorld(db, "worlds", worldId,),).toBe(0,);
    expect(await countWorld(db, "locations", worldId,),).toBe(0,);

    // The historical log survives with its binding released.
    const logs = await db
      .selectFrom("interaction_logs",)
      .select(["id", "location_id",],)
      .where("actor_id", "=", actorId,)
      .execute();

    expect(logs,).toHaveLength(1,);
    expect(logs[0]?.location_id,).toBeNull();
  });
});
