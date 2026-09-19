// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { randomUUID, } from "node:crypto";
import { createTestDb, resetTestDb, type TestDb, } from "../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../test-utils/insert-helpers";
import { TravelRouteService, } from "./routes";
import { TravelTickEngine, } from "./travel-engine";

let testDb: TestDb;
const OWNER = "tick-test-owner";

async function makeWorld(): Promise<string> {
  const worldId = randomUUID();
  await insertWorlds(testDb.db, OWNER, `world-${worldId.slice(0, 8,)}`, { id: worldId, },);
  return worldId;
}

async function makeTransportKindLoc(worldId: string, mobility: string,): Promise<string> {
  const id = randomUUID();
  testDb.sqlite.run(
    `INSERT INTO locations (id, world_id, name, description, connections, publication_status, parent_location_id, kind, mobility_mode)
     VALUES (?, ?, 'ship', '', '[]', 'draft', NULL, 'transport', ?)`,
    [id, worldId, mobility,],
  );
  return id;
}

async function makeStop(worldId: string, name: string,): Promise<string> {
  const id = randomUUID();
  testDb.sqlite.run(
    `INSERT INTO locations (id, world_id, name, description, connections, publication_status, parent_location_id, kind, mobility_mode)
     VALUES (?, ?, ?, '', '[]', 'draft', NULL, 'transit', 'static')`,
    [id, worldId, name,],
  );
  return id;
}

beforeAll(async () => {
  testDb = await createTestDb();
  await insertUsers(testDb.db, OWNER, "Tick Owner", { id: OWNER, },);
},);

afterAll(async () => {
  await testDb.db.destroy();
  testDb.sqlite.close();
},);

describe("TravelTickEngine", () => {
  beforeEach(async () => {
    await resetTestDb(testDb.sqlite,);
    await insertUsers(testDb.db, OWNER, "Tick Owner", { id: OWNER, },);
  },);

  test("tick advances a transport along its route and wraps on loop=1", async () => {
    const routes = new TravelRouteService(testDb.db,);
    const engine = new TravelTickEngine(testDb.db,);
    const worldId = await makeWorld();
    const routeId = await routes.createRoute({ worldId, name: "Coast", kind: "sea", loop: true, secondsPerUnit: 60, },);
    const a = await makeStop(worldId, "portA",);
    const b = await makeStop(worldId, "portB",);
    const c = await makeStop(worldId, "portC",);
    await routes.addStop({ routeId, locationId: a, stopOrder: 0, },);
    await routes.addStop({ routeId, locationId: b, stopOrder: 1, },);
    await routes.addStop({ routeId, locationId: c, stopOrder: 2, },);
    const ship = await makeTransportKindLoc(worldId, "free",);
    await routes.attachTransport(ship, routeId,);
    // Each tick of 60s adds 1 unit (seconds_per_unit=60). After 4 ticks, 4 units → wraps to 1.
    for (let i = 0; i < 4; i++) { await engine.tick({ elapsedSeconds: 60, },); }
    const row = testDb.sqlite.query(`SELECT travel_progress FROM locations WHERE id = ?`,).get(ship,) as {
      travel_progress: number;
    };
    expect(row.travel_progress,).toBe(1,); // 4 % 3 = 1
  });

  test("tick pins arrival at the last stop when loop=0", async () => {
    const routes = new TravelRouteService(testDb.db,);
    const engine = new TravelTickEngine(testDb.db,);
    const worldId = await makeWorld();
    const routeId = await routes.createRoute({
      worldId,
      name: "OneWay",
      kind: "road",
      loop: false,
      secondsPerUnit: 60,
    },);
    await routes.addStop({ routeId, locationId: await makeStop(worldId, "x",), stopOrder: 0, },);
    await routes.addStop({ routeId, locationId: await makeStop(worldId, "y",), stopOrder: 1, },);
    await routes.addStop({ routeId, locationId: await makeStop(worldId, "z",), stopOrder: 2, },);
    const ship = await makeTransportKindLoc(worldId, "free",);
    await routes.attachTransport(ship, routeId,);
    // 10 ticks of 60s = 10 units. loop=0 → cap at stop_count-1 = 2.
    for (let i = 0; i < 10; i++) { await engine.tick({ elapsedSeconds: 60, },); }
    const row = testDb.sqlite.query(`SELECT travel_progress FROM locations WHERE id = ?`,).get(ship,) as {
      travel_progress: number;
    };
    expect(row.travel_progress,).toBe(2,);
  });

  test("tick skips non-moving (anchored) transports", async () => {
    const routes = new TravelRouteService(testDb.db,);
    const engine = new TravelTickEngine(testDb.db,);
    const worldId = await makeWorld();
    const routeId = await routes.createRoute({
      worldId,
      name: "Coast2",
      kind: "sea",
      loop: true,
      secondsPerUnit: 60,
    },);
    await routes.addStop({ routeId, locationId: await makeStop(worldId, "s1",), stopOrder: 0, },);
    await routes.addStop({ routeId, locationId: await makeStop(worldId, "s2",), stopOrder: 1, },);
    const ship = await makeTransportKindLoc(worldId, "anchored",);
    await routes.attachTransport(ship, routeId,);
    const before = (testDb.sqlite.query(`SELECT travel_progress FROM locations WHERE id = ?`,).get(ship,) as {
      travel_progress: number;
    }).travel_progress;
    const summary = await engine.tick({ elapsedSeconds: 60, },);
    const after = (testDb.sqlite.query(`SELECT travel_progress FROM locations WHERE id = ?`,).get(ship,) as {
      travel_progress: number;
    }).travel_progress;
    expect(after,).toBe(before,);
    expect(summary.advanced,).toBe(0,);
  });

  test("tick returns summary counts", async () => {
    const routes = new TravelRouteService(testDb.db,);
    const engine = new TravelTickEngine(testDb.db,);
    const worldId = await makeWorld();
    const routeId = await routes.createRoute({
      worldId,
      name: "Coast3",
      kind: "sea",
      loop: true,
      secondsPerUnit: 30,
    },);
    await routes.addStop({ routeId, locationId: await makeStop(worldId, "a",), stopOrder: 0, },);
    await routes.addStop({ routeId, locationId: await makeStop(worldId, "b",), stopOrder: 1, },);
    const ship = await makeTransportKindLoc(worldId, "free",);
    await routes.attachTransport(ship, routeId,);
    const summary = await engine.tick({ elapsedSeconds: 30, },);
    expect(summary.advanced,).toBe(1,);
    expect(summary.capped,).toBe(0,);
  });
});
