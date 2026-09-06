// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for getLocationConnections.
 *
 * Real in-memory DB round-trips: unknown locations, same-world
 * membership as a set, self exclusion, the five-connection limit,
 * and cross-world isolation.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema.js";
import { createTestDb, } from "../../../test-utils/create-test-db.js";
import {
  insertLocations,
  insertLocationStates,
  insertUsers,
  insertWorlds,
} from "../../../test-utils/insert-helpers.js";
import { uid, } from "../../../utils.js";
import { getLocationConnections, } from "./pathfinding.js";

let db: Kysely<DB>;

beforeAll(async () => {
  ({ db, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

/** Create a world owned by a fresh user and return both ids. */
async function makeWorld(name: string,): Promise<{ ownerId: string; worldId: string }> {
  const ownerId = uid();
  const worldId = uid();
  await insertUsers(db, `owner-${ownerId}`, `Owner ${name}`, { id: ownerId, },);
  await insertWorlds(db, ownerId, name, { id: worldId, },);
  return { ownerId, worldId, };
}

/** Create a location plus its state row and return the location id. */
async function makeLocation(worldId: string, name: string,): Promise<string> {
  const locationId = uid();
  await insertLocations(db, worldId, name, { id: locationId, },);
  await insertLocationStates(db, locationId, worldId,);
  return locationId;
}

describe("getLocationConnections", () => {
  test("returns empty for an unknown location", async () => {
    expect(await getLocationConnections(db, uid(),),).toEqual([],);
  });

  test("returns same-world locations excluding self", async () => {
    const { worldId, } = await makeWorld("Forest Realm",);
    const hall = await makeLocation(worldId, "Hall",);
    const garden = await makeLocation(worldId, "Garden",);
    const tower = await makeLocation(worldId, "Tower",);

    const connections = await getLocationConnections(db, hall,);
    expect(connections.toSorted(),).toEqual([garden, tower,].toSorted(),);
    expect(connections,).not.toContain(hall,);
  });

  test("limits results to five connections", async () => {
    const { worldId, } = await makeWorld("Crowded Realm",);
    const hub = await makeLocation(worldId, "Hub",);
    const others: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      others.push(await makeLocation(worldId, `Spot ${i}`,),);
    }

    const connections = await getLocationConnections(db, hub,);
    expect(connections,).toHaveLength(5,);
    expect(connections,).not.toContain(hub,);
    for (const id of connections) {
      expect(others,).toContain(id,);
    }
  });

  test("isolates worlds: connections never cross into another world", async () => {
    const first = await makeWorld("First World",);
    const second = await makeWorld("Second World",);
    const home = await makeLocation(first.worldId, "Home",);
    const neighbor = await makeLocation(first.worldId, "Neighbor",);
    const farAway = await makeLocation(second.worldId, "Far Away",);

    const connections = await getLocationConnections(db, home,);
    expect(connections,).toEqual([neighbor,],);
    expect(connections,).not.toContain(farAway,);
  });

  test("returns empty when the location is alone in its world", async () => {
    const { worldId, } = await makeWorld("Lonely Realm",);
    const solo = await makeLocation(worldId, "Solo",);
    expect(await getLocationConnections(db, solo,),).toEqual([],);
  });
});
