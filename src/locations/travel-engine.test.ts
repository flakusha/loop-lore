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

async function makeStop(
  worldId: string,
  name: string,
  coords?: { x: number; y: number; z: number },
): Promise<string> {
  const id = randomUUID();
  testDb.sqlite.run(
    `INSERT INTO locations (id, world_id, name, description, connections, publication_status, parent_location_id, kind, mobility_mode, coord_x, coord_y, coord_z)
     VALUES (?, ?, ?, '', '[]', 'draft', NULL, 'transit', 'static', ?, ?, ?)`,
    [id, worldId, name, coords?.x ?? null, coords?.y ?? null, coords?.z ?? null,],
  );

  return id;
}

function addRider(actorId: string, transportId: string, spatialId: string,): void {
  testDb.sqlite.run(
    `INSERT INTO actor_locations (actor_id, physical_location_id, spatial_location_id, entered_at)
     VALUES (?, ?, ?, datetime('now'))`,
    [actorId, transportId, spatialId,],
  );
}

interface EventRow {
  world_id: string;
  event_type: string;
  subject_id: string;
  tick_index: number;
  payload: string;
}

function eventsFor(transportId: string,): EventRow[] {
  return testDb.sqlite.query(
    `SELECT world_id, event_type, subject_id, tick_index, payload
     FROM world_event_log WHERE subject_id = ? ORDER BY id`,
  ).all(transportId,) as EventRow[];
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

  test("no crossing leaves coords, riders and events untouched", async () => {
    const routes = new TravelRouteService(testDb.db,);
    const engine = new TravelTickEngine(testDb.db,);
    const worldId = await makeWorld();
    const routeId = await routes.createRoute({ worldId, name: "Calm", kind: "sea", loop: true, secondsPerUnit: 60, },);
    const a = await makeStop(worldId, "a", { x: 1, y: 2, z: 3, },);
    const b = await makeStop(worldId, "b", { x: 4, y: 5, z: 6, },);
    await routes.addStop({ routeId, locationId: a, stopOrder: 0, },);
    await routes.addStop({ routeId, locationId: b, stopOrder: 1, },);
    const ship = await makeTransportKindLoc(worldId, "free",);
    await routes.attachTransport(ship, routeId,);
    testDb.sqlite.run(`UPDATE locations SET coord_x = 99, coord_y = 99, coord_z = 99 WHERE id = ?`, [ship,],);
    addRider("rider-no-cross", ship, a,);

    await engine.tick({ elapsedSeconds: 30, tickIndex: 7, },);

    const loc = testDb.sqlite.query(`SELECT coord_x, coord_y, coord_z FROM locations WHERE id = ?`,).get(ship,) as {
      coord_x: number;
      coord_y: number;
      coord_z: number;
    };

    expect([loc.coord_x, loc.coord_y, loc.coord_z,],).toEqual([99, 99, 99,],);
    const rider = testDb.sqlite.query(`SELECT spatial_location_id FROM actor_locations WHERE actor_id = ?`,).get(
      "rider-no-cross",
    ) as {
      spatial_location_id: string;
    };

    expect(rider.spatial_location_id,).toBe(a,);
    expect(eventsFor(ship,),).toHaveLength(0,);
  });

  test("terminal arrival snaps coords + riders and emits one arrival event", async () => {
    const routes = new TravelRouteService(testDb.db,);
    const engine = new TravelTickEngine(testDb.db,);
    const worldId = await makeWorld();
    const routeId = await routes.createRoute({
      worldId,
      name: "LastCall",
      kind: "road",
      loop: false,
      secondsPerUnit: 60,
    },);

    const a = await makeStop(worldId, "a", { x: 1, y: 1, z: 1, },);
    const b = await makeStop(worldId, "b", { x: 7, y: 8, z: 9, },);
    await routes.addStop({ routeId, locationId: a, stopOrder: 0, },);
    await routes.addStop({ routeId, locationId: b, stopOrder: 1, },);
    const ship = await makeTransportKindLoc(worldId, "free",);
    await routes.attachTransport(ship, routeId,);
    testDb.sqlite.run(`UPDATE locations SET travel_progress = 1 WHERE id = ?`, [ship,],);
    addRider("rider-arrive", ship, a,);

    await engine.tick({ elapsedSeconds: 60, tickIndex: 3, },);

    const loc = testDb.sqlite.query(`SELECT coord_x, coord_y, coord_z FROM locations WHERE id = ?`,).get(ship,) as {
      coord_x: number;
      coord_y: number;
      coord_z: number;
    };

    expect([loc.coord_x, loc.coord_y, loc.coord_z,],).toEqual([7, 8, 9,],);
    const rider = testDb.sqlite.query(
      `SELECT physical_location_id, spatial_location_id FROM actor_locations WHERE actor_id = ?`,
    ).get("rider-arrive",) as {
      physical_location_id: string;
      spatial_location_id: string;
    };

    expect(rider.physical_location_id,).toBe(ship,);
    expect(rider.spatial_location_id,).toBe(b,);

    const events = eventsFor(ship,);
    expect(events,).toHaveLength(1,);
    expect(events[0]!.event_type,).toBe("transport:arrived",);
    expect(events[0]!.subject_id,).toBe(ship,);
    expect(events[0]!.world_id,).toBe(worldId,);
    expect(events[0]!.tick_index,).toBe(3,);
    const payload = JSON.parse(events[0]!.payload,) as {
      routeId: string;
      stopId: string;
      progress: number;
      coords: { x: number; y: number; z: number };
    };

    expect(payload.routeId,).toBe(routeId,);
    expect(payload.stopId,).toBe(b,);
    expect(payload.progress,).toBe(1,);
    expect(payload.coords,).toEqual({ x: 7, y: 8, z: 9, },);
  });

  test("loop wrap also emits a departure event", async () => {
    const routes = new TravelRouteService(testDb.db,);
    const engine = new TravelTickEngine(testDb.db,);
    const worldId = await makeWorld();
    const routeId = await routes.createRoute({ worldId, name: "Loop", kind: "sea", loop: true, secondsPerUnit: 60, },);
    const a = await makeStop(worldId, "a", { x: 1, y: 2, z: 3, },);
    const b = await makeStop(worldId, "b", { x: 4, y: 5, z: 6, },);
    await routes.addStop({ routeId, locationId: a, stopOrder: 0, },);
    await routes.addStop({ routeId, locationId: b, stopOrder: 1, },);
    const ship = await makeTransportKindLoc(worldId, "free",);
    await routes.attachTransport(ship, routeId,);
    testDb.sqlite.run(`UPDATE locations SET travel_progress = 1 WHERE id = ?`, [ship,],);

    await engine.tick({ elapsedSeconds: 60, tickIndex: 9, },);

    expect(eventsFor(ship,).map((e,) => e.event_type).sort(),).toEqual(["transport:arrived", "transport:departed",],);
    const loc = testDb.sqlite.query(`SELECT coord_x, coord_y, coord_z FROM locations WHERE id = ?`,).get(ship,) as {
      coord_x: number;
      coord_y: number;
      coord_z: number;
    };

    expect([loc.coord_x, loc.coord_y, loc.coord_z,],).toEqual([1, 2, 3,],);
  });

  test("a second identical tick does not duplicate events", async () => {
    const routes = new TravelRouteService(testDb.db,);
    const engine = new TravelTickEngine(testDb.db,);
    const worldId = await makeWorld();
    const routeId = await routes.createRoute({
      worldId,
      name: "Replay",
      kind: "road",
      loop: false,
      secondsPerUnit: 60,
    },);

    const a = await makeStop(worldId, "a", { x: 1, y: 1, z: 1, },);
    const b = await makeStop(worldId, "b", { x: 2, y: 2, z: 2, },);
    await routes.addStop({ routeId, locationId: a, stopOrder: 0, },);
    await routes.addStop({ routeId, locationId: b, stopOrder: 1, },);
    const ship = await makeTransportKindLoc(worldId, "free",);
    await routes.attachTransport(ship, routeId,);

    await engine.tick({ elapsedSeconds: 120, tickIndex: 11, },);
    expect(eventsFor(ship,),).toHaveLength(1,);
    await engine.tick({ elapsedSeconds: 120, tickIndex: 11, },);
    expect(eventsFor(ship,),).toHaveLength(1,);
  });
});

// BUG-travel-route-stop-delete-ignores-routeid-cross-world-idor: removeStop used
// to delete by stop id only, so a route id from world A could delete world B's
// stops (the route layer only checks the path world's owner).
describe("TravelRouteService.removeStop scoping", () => {
  beforeEach(async () => {
    await resetTestDb(testDb.sqlite,);
    await insertUsers(testDb.db, OWNER, "Tick Owner", { id: OWNER, },);
  },);

  test("refuses to delete another route's stop by bare id", async () => {
    const routes = new TravelRouteService(testDb.db,);
    const worldA = await makeWorld();
    const worldB = await makeWorld();
    const routeA = await routes.createRoute({
      worldId: worldA,
      name: "A-line",
      kind: "sea",
      loop: false,
      secondsPerUnit: 60,
    },);

    const routeB = await routes.createRoute({
      worldId: worldB,
      name: "B-line",
      kind: "sea",
      loop: false,
      secondsPerUnit: 60,
    },);

    const stopBLoc = await makeStop(worldB, "foreign-stop",);
    const foreignStopRow = await routes.addStop({ routeId: routeB, locationId: stopBLoc, stopOrder: 0, },);

    await routes.removeStop(routeA, foreignStopRow,);

    const row = testDb.sqlite.query(`SELECT id FROM travel_route_stops WHERE id = ?`,).get(foreignStopRow,);
    expect(row,).toBeTruthy();
  });

  test("deletes a stop that belongs to the given route", async () => {
    const routes = new TravelRouteService(testDb.db,);
    const worldId = await makeWorld();
    const routeId = await routes.createRoute({
      worldId,
      name: "own-line",
      kind: "sea",
      loop: false,
      secondsPerUnit: 60,
    },);

    const stopLoc = await makeStop(worldId, "own-stop",);
    const stopRow = await routes.addStop({ routeId, locationId: stopLoc, stopOrder: 0, },);

    await routes.removeStop(routeId, stopRow,);

    const row = testDb.sqlite.query(`SELECT id FROM travel_route_stops WHERE id = ?`,).get(stopRow,);
    expect(row,).toBeNull();
  });
});
