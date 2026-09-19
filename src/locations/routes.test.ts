// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { randomUUID, } from "node:crypto";
import { createTestDb, resetTestDb, type TestDb, } from "../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../test-utils/insert-helpers";
import { TravelRouteService, } from "./routes";

let testDb: TestDb;
const OWNER = "route-test-owner";

async function makeWorld(): Promise<string> {
  return await (async () => {
    const worldId = randomUUID();
    await insertWorlds(testDb.db, OWNER, `world-${worldId.slice(0, 8,)}`, { id: worldId, },);
    return worldId;
  })();
}

async function makeTransportKindLocation(
  worldId: string,
  parentId: string | null,
  mobilityMode: string,
): Promise<string> {
  const id = randomUUID();
  testDb.sqlite.run(
    `INSERT INTO locations (id, world_id, name, description, connections, publication_status, parent_location_id, kind, mobility_mode)
     VALUES (?, ?, 'sea-port', '', '[]', 'draft', ?, 'transport', ?)`,
    [id, worldId, parentId, mobilityMode,],
  );
  return id;
}

beforeAll(async () => {
  testDb = await createTestDb();
  await insertUsers(testDb.db, OWNER, "Route Owner", { id: OWNER, },);
},);

afterAll(async () => {
  await testDb.db.destroy();
  testDb.sqlite.close();
},);

describe("TravelRouteService", () => {
  beforeAll(async () => {
    await resetTestDb(testDb.sqlite,);
    await insertUsers(testDb.db, OWNER, "Route Owner", { id: OWNER, },);
  },);

  test("createRoute returns id and rows persist", async () => {
    const svc = new TravelRouteService(testDb.db,);
    const worldId = await makeWorld();
    const id = await svc.createRoute({ worldId, name: "Coast", kind: "sea", loop: true, secondsPerUnit: 120, },);
    const row = testDb.sqlite.query(`SELECT * FROM travel_routes WHERE id = ?`,).get(id,) as any;
    expect(row.world_id,).toBe(worldId,);
    expect(row.kind,).toBe("sea",);
    expect(row.loop,).toBe(1,);
    expect(row.seconds_per_unit,).toBe(120,);
  });

  test("addStop + getStops: ordered, unique stop_order per route", async () => {
    const svc = new TravelRouteService(testDb.db,);
    const worldId = await makeWorld();
    const routeId = await svc.createRoute({ worldId, name: "R2", kind: "road", },);
    const a = await makeTransportKindLocation(worldId, null, "free",);
    // Make ordinary ports (transit kind) instead — these are STOPS, not the moving transport.
    const stopA = await (async () => {
      const id = randomUUID();
      testDb.sqlite.run(
        `INSERT INTO locations (id, world_id, name, description, connections, publication_status, parent_location_id, kind, mobility_mode)
         VALUES (?, ?, 'port-a', '', '[]', 'draft', NULL, 'transit', 'static')`,
        [id, worldId,],
      );
      return id;
    })();
    const stopB = await (async () => {
      const id = randomUUID();
      testDb.sqlite.run(
        `INSERT INTO locations (id, world_id, name, description, connections, publication_status, parent_location_id, kind, mobility_mode)
         VALUES (?, ?, 'port-b', '', '[]', 'draft', NULL, 'transit', 'static')`,
        [id, worldId,],
      );
      return id;
    })();
    await svc.addStop({ routeId, locationId: stopA, stopOrder: 0, },);
    await svc.addStop({ routeId, locationId: stopB, stopOrder: 1, },);
    const stops = await svc.getStops(routeId,);
    expect(stops.map((s,) => s.location_id),).toEqual([stopA, stopB,],);
    expect(stops.map((s,) => s.stop_order),).toEqual([0, 1,],);
    // Suppress unused-var warning.
    void a;
  });

  test("addStop rejects cross-world stop", async () => {
    const svc = new TravelRouteService(testDb.db,);
    const w1 = await makeWorld();
    const w2 = await makeWorld();
    const routeId = await svc.createRoute({ worldId: w1, name: "R3", kind: "air", },);
    const stopX = await (async () => {
      const id = randomUUID();
      testDb.sqlite.run(
        `INSERT INTO locations (id, world_id, name, description, connections, publication_status, parent_location_id, kind, mobility_mode)
         VALUES (?, ?, 'x', '', '[]', 'draft', NULL, 'transit', 'static')`,
        [id, w2,],
      );
      return id;
    })();
    await expect(svc.addStop({ routeId, locationId: stopX, stopOrder: 0, },),).rejects.toThrow(/cross-world/,);
  });

  test("attachTransport sets current_route_id and rejects non-transport / static", async () => {
    const svc = new TravelRouteService(testDb.db,);
    const worldId = await makeWorld();
    const routeId = await svc.createRoute({ worldId, name: "R4", kind: "custom", },);
    const ship = await makeTransportKindLocation(worldId, null, "free",);
    await svc.attachTransport(ship, routeId,);
    const row = testDb.sqlite.query(`SELECT current_route_id, travel_progress FROM locations WHERE id = ?`,).get(
      ship,
    ) as any;
    expect(row.current_route_id,).toBe(routeId,);
    expect(row.travel_progress,).toBe(0,);
    // Static transport cannot be attached.
    const dock = await makeTransportKindLocation(worldId, null, "static",);
    await expect(svc.attachTransport(dock, routeId,),).rejects.toThrow(/transport must not be static/,);
    // Non-transport kind cannot be attached.
    const town = await (async () => {
      const id = randomUUID();
      testDb.sqlite.run(
        `INSERT INTO locations (id, world_id, name, description, connections, publication_status, parent_location_id, kind, mobility_mode)
         VALUES (?, ?, 'town', '', '[]', 'draft', NULL, 'settlement', 'static')`,
        [id, worldId,],
      );
      return id;
    })();
    await expect(svc.attachTransport(town, routeId,),).rejects.toThrow(/location kind must be 'transport'/,);
  });

  test("detachTransport clears current_route_id and zeros progress", async () => {
    const svc = new TravelRouteService(testDb.db,);
    const worldId = await makeWorld();
    const routeId = await svc.createRoute({ worldId, name: "R5", kind: "sea", },);
    const ship = await makeTransportKindLocation(worldId, null, "free",);
    await svc.attachTransport(ship, routeId,);
    // Pretend the transport has progressed.
    testDb.sqlite.run(`UPDATE locations SET travel_progress = 2 WHERE id = ?`, [ship,],);
    await svc.detachTransport(ship,);
    const row = testDb.sqlite.query(`SELECT current_route_id, travel_progress FROM locations WHERE id = ?`,).get(
      ship,
    ) as any;
    expect(row.current_route_id,).toBeNull();
    expect(row.travel_progress,).toBe(0,);
  });

  test("getRoutesThroughLocation returns routes with this location as a stop", async () => {
    const svc = new TravelRouteService(testDb.db,);
    const worldId = await makeWorld();
    const r1 = await svc.createRoute({ worldId, name: "RA", kind: "sea", },);
    const r2 = await svc.createRoute({ worldId, name: "RB", kind: "air", },);
    const shared = await (async () => {
      const id = randomUUID();
      testDb.sqlite.run(
        `INSERT INTO locations (id, world_id, name, description, connections, publication_status, parent_location_id, kind, mobility_mode)
         VALUES (?, ?, 'shared-port', '', '[]', 'draft', NULL, 'transit', 'static')`,
        [id, worldId,],
      );
      return id;
    })();
    await svc.addStop({ routeId: r1, locationId: shared, stopOrder: 0, },);
    await svc.addStop({ routeId: r2, locationId: shared, stopOrder: 0, },);
    const found = await svc.getRoutesThroughLocation(shared,);
    expect(found.map((r,) => r.id).sort(),).toEqual([r1, r2,].sort(),);
  });

  test("progressToLocation maps travel_progress to a stop", async () => {
    const svc = new TravelRouteService(testDb.db,);
    const worldId = await makeWorld();
    const routeId = await svc.createRoute({ worldId, name: "PR", kind: "road", },);
    const stopA = await (async () => {
      const id = randomUUID();
      testDb.sqlite.run(
        `INSERT INTO locations (id, world_id, name, description, connections, publication_status, parent_location_id, kind, mobility_mode)
         VALUES (?, ?, 'sp-A', '', '[]', 'draft', NULL, 'transit', 'static')`,
        [id, worldId,],
      );
      return id;
    })();
    const stopB = await (async () => {
      const id = randomUUID();
      testDb.sqlite.run(
        `INSERT INTO locations (id, world_id, name, description, connections, publication_status, parent_location_id, kind, mobility_mode)
         VALUES (?, ?, 'sp-B', '', '[]', 'draft', NULL, 'transit', 'static')`,
        [id, worldId,],
      );
      return id;
    })();
    const stopC = await (async () => {
      const id = randomUUID();
      testDb.sqlite.run(
        `INSERT INTO locations (id, world_id, name, description, connections, publication_status, parent_location_id, kind, mobility_mode)
         VALUES (?, ?, 'sp-C', '', '[]', 'draft', NULL, 'transit', 'static')`,
        [id, worldId,],
      );
      return id;
    })();
    await svc.addStop({ routeId, locationId: stopA, stopOrder: 0, },);
    await svc.addStop({ routeId, locationId: stopB, stopOrder: 1, },);
    await svc.addStop({ routeId, locationId: stopC, stopOrder: 2, },);
    const ship = await makeTransportKindLocation(worldId, null, "free",);
    await svc.attachTransport(ship, routeId,);
    testDb.sqlite.run(`UPDATE locations SET travel_progress = 1 WHERE id = ?`, [ship,],);
    const pos = await svc.progressToLocation(ship,);
    expect(pos,).toEqual({ stopOrder: 1, stopLocationId: stopB, },);
  });

  test("createRoute persists defaults (loop=0, seconds_per_unit=60, waypoints=[])", async () => {
    const svc = new TravelRouteService(testDb.db,);
    const worldId = await makeWorld();
    const routeId = await svc.createRoute({ worldId, name: "Defaults", kind: "road", },);
    const row = testDb.sqlite.query(`SELECT loop, seconds_per_unit, waypoints FROM travel_routes WHERE id = ?`,).get(
      routeId,
    ) as any;
    expect(row.loop,).toBe(0,);
    expect(row.seconds_per_unit,).toBe(60,);
    expect(JSON.parse(row.waypoints as string,),).toEqual([],);
  });

  test("createRoute falls back to waypoints '[]' when serialization fails", async () => {
    const svc = new TravelRouteService(testDb.db,);
    const worldId = await makeWorld();
    // BigInt is not JSON-serializable; jsonStringifyOr falls back to "[]".
    const routeId = await svc.createRoute(
      { worldId, name: "bad-serialization", kind: "road", waypoints: [{ x: BigInt(1,), y: 0, },] as never, },
    );
    const row = testDb.sqlite.query(`SELECT waypoints FROM travel_routes WHERE id = ?`,).get(routeId,) as any;
    expect(row.waypoints,).toBe("[]",);
  });

  test("addStop rejects unknown route and unknown location", async () => {
    const svc = new TravelRouteService(testDb.db,);
    const worldId = await makeWorld();
    const orphan = randomUUID();
    testDb.sqlite.run(
      `INSERT INTO locations (id, world_id, name, description, connections, publication_status, parent_location_id, kind, mobility_mode)
       VALUES (?, ?, 'orphan', '', '[]', 'draft', NULL, 'transit', 'static')`,
      [orphan, worldId,],
    );
    await expect(svc.addStop({ routeId: randomUUID(), locationId: orphan, stopOrder: 0, },),).rejects.toThrow(
      /travel route not found/,
    );
    const routeId = await svc.createRoute({ worldId, name: "R6", kind: "road", },);
    await expect(svc.addStop({ routeId, locationId: randomUUID(), stopOrder: 0, },),).rejects.toThrow(
      /location not found/,
    );
  });

  test("progressToLocation: null without route, null on stopless route, clamps on overshoot", async () => {
    const svc = new TravelRouteService(testDb.db,);
    const worldId = await makeWorld();
    const drifter = await makeTransportKindLocation(worldId, null, "free",);
    // No current_route_id at all.
    expect(await svc.progressToLocation(drifter,),).toBeNull();

    const routeId = await svc.createRoute({ worldId, name: "R8", kind: "road", },);
    await svc.attachTransport(drifter, routeId,);
    // Attached, but the route has no stops yet.
    expect(await svc.progressToLocation(drifter,),).toBeNull();

    const c1 = await (async () => {
      const sid = randomUUID();
      testDb.sqlite.run(
        `INSERT INTO locations (id, world_id, name, description, connections, publication_status, parent_location_id, kind, mobility_mode)
         VALUES (?, ?, 'c1', '', '[]', 'draft', NULL, 'transit', 'static')`,
        [sid, worldId,],
      );
      return sid;
    })();
    const c2 = await (async () => {
      const sid = randomUUID();
      testDb.sqlite.run(
        `INSERT INTO locations (id, world_id, name, description, connections, publication_status, parent_location_id, kind, mobility_mode)
         VALUES (?, ?, 'c2', '', '[]', 'draft', NULL, 'transit', 'static')`,
        [sid, worldId,],
      );
      return sid;
    })();
    await svc.addStop({ routeId, locationId: c1, stopOrder: 0, },);
    await svc.addStop({ routeId, locationId: c2, stopOrder: 1, },);
    // Overshoot the segment range; must clamp to the LAST stop.
    testDb.sqlite.run(`UPDATE locations SET travel_progress = 9 WHERE id = ?`, [drifter,],);
    expect(await svc.progressToLocation(drifter,),).toEqual({ stopOrder: 1, stopLocationId: c2, },);
  });

  test("listRoutes returns routes in a world, ordered by name", async () => {
    const svc = new TravelRouteService(testDb.db,);
    const worldId = await makeWorld();
    await svc.createRoute({ worldId, name: "Bravo", kind: "sea", },);
    await svc.createRoute({ worldId, name: "Alpha", kind: "road", },);
    const list = await svc.listRoutes(worldId,);
    expect(list.map((r,) => r.name),).toEqual(["Alpha", "Bravo",],);
  });

  test("getRoute scopes by world; null for missing or cross-world", async () => {
    const svc = new TravelRouteService(testDb.db,);
    const worldA = await makeWorld();
    const worldB = await makeWorld();
    const id = await svc.createRoute({ worldId: worldA, name: "R", kind: "sea", },);
    expect((await svc.getRoute(worldA, id,))?.name,).toBe("R",);
    expect(await svc.getRoute(worldB, id,),).toBeUndefined();
    expect(await svc.getRoute(worldA, "missing",),).toBeUndefined();
  });

  test("removeStop deletes a stop; listStops reflects the change", async () => {
    const svc = new TravelRouteService(testDb.db,);
    const worldId = await makeWorld();
    const routeId = await svc.createRoute({ worldId, name: "R", kind: "sea", },);
    const a = await (async () => {
      const id = randomUUID();
      testDb.sqlite.run(
        "INSERT INTO locations (id, world_id, name, description, connections, publication_status, parent_location_id, kind, mobility_mode) VALUES (?, ?, 'sA', '', '[]', 'draft', NULL, 'transit', 'static')",
        [id, worldId,],
      );
      return id;
    })();
    const stopId = await svc.addStop({ routeId, locationId: a, stopOrder: 0, },);
    expect((await svc.listStops(routeId,)).length,).toBe(1,);
    await svc.removeStop(routeId, stopId,);
    expect((await svc.listStops(routeId,)).length,).toBe(0,);
  });
});
