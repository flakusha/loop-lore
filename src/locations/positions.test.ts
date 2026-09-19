// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { randomUUID, } from "node:crypto";
import { createTestDb, resetTestDb, type TestDb, } from "../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../test-utils/insert-helpers";
import { ActorPositionService, } from "./positions";
import { TravelRouteService, } from "./routes";

let testDb: TestDb;
const OWNER = "position-test-owner";

async function makeWorld(): Promise<string> {
  const worldId = randomUUID();
  await insertWorlds(testDb.db, OWNER, `world-${worldId.slice(0, 8,)}`, { id: worldId, },);
  return worldId;
}

async function makeLoc(worldId: string, kind: string, mobilityMode: string, name = "loc",): Promise<string> {
  const id = randomUUID();
  testDb.sqlite.run(
    `INSERT INTO locations (id, world_id, name, description, connections, publication_status, parent_location_id, kind, mobility_mode)
     VALUES (?, ?, ?, '', '[]', 'draft', NULL, ?, ?)`,
    [id, worldId, name, kind, mobilityMode,],
  );
  return id;
}

beforeAll(async () => {
  testDb = await createTestDb();
  await insertUsers(testDb.db, OWNER, "Pos Owner", { id: OWNER, },);
},);

afterAll(async () => {
  await testDb.db.destroy();
  testDb.sqlite.close();
},);

describe("ActorPositionService", () => {
  beforeAll(async () => {
    await resetTestDb(testDb.sqlite,);
    await insertUsers(testDb.db, OWNER, "Pos Owner", { id: OWNER, },);
  },);

  test("setPosition + getPosition: physical == spatial for a static location", async () => {
    const svc = new ActorPositionService(testDb.db,);
    const worldId = await makeWorld();
    const loc = await makeLoc(worldId, "settlement", "static", "town",);
    await svc.setPosition("actor-1", loc, loc,);
    const pos = await svc.getPosition("actor-1",);
    expect(pos,).not.toBeNull();
    expect(pos!.physicalLocationId,).toBe(loc,);
    expect(pos!.spatialLocationId,).toBe(loc,);
    expect(pos!.enteredAt,).toBeTruthy();
  });

  test("setPosition on existing row updates entered_at", async () => {
    const svc = new ActorPositionService(testDb.db,);
    const worldId = await makeWorld();
    const a = await makeLoc(worldId, "settlement", "static", "a",);
    const b = await makeLoc(worldId, "settlement", "static", "b",);
    await svc.setPosition("actor-2", a, a,);
    const first = await svc.getPosition("actor-2",);
    // Force a delay so the timestamp differs.
    await new Promise((r,) => setTimeout(r, 10,));
    await svc.setPosition("actor-2", b, b,);
    const second = await svc.getPosition("actor-2",);
    expect(second!.physicalLocationId,).toBe(b,);
    expect(second!.spatialLocationId,).toBe(b,);
    expect(new Date(second!.enteredAt,).getTime(),).toBeGreaterThanOrEqual(new Date(first!.enteredAt,).getTime(),);
  });

  test("setPosition rejects cross-world physical/spatial", async () => {
    const svc = new ActorPositionService(testDb.db,);
    const w1 = await makeWorld();
    const w2 = await makeWorld();
    const a = await makeLoc(w1, "settlement", "static", "a",);
    const b = await makeLoc(w2, "settlement", "static", "b",);
    await expect(svc.setPosition("actor-3", a, b,),).rejects.toThrow(/share a world/,);
  });

  test("clearPosition removes the row", async () => {
    const svc = new ActorPositionService(testDb.db,);
    const worldId = await makeWorld();
    const loc = await makeLoc(worldId, "settlement", "static",);
    await svc.setPosition("actor-4", loc, loc,);
    expect(await svc.getPosition("actor-4",),).not.toBeNull();
    await svc.clearPosition("actor-4",);
    expect(await svc.getPosition("actor-4",),).toBeNull();
  });

  test("deriveForTransport: physical = transport, spatial = current stop", async () => {
    const routes = new TravelRouteService(testDb.db,);
    const positions = new ActorPositionService(testDb.db,);
    const worldId = await makeWorld();
    const routeId = await routes.createRoute({ worldId, name: "Coast", kind: "sea", },);
    const portA = await makeLoc(worldId, "transit", "static", "portA",);
    const portB = await makeLoc(worldId, "transit", "static", "portB",);
    const portC = await makeLoc(worldId, "transit", "static", "portC",);
    await routes.addStop({ routeId, locationId: portA, stopOrder: 0, },);
    await routes.addStop({ routeId, locationId: portB, stopOrder: 1, },);
    await routes.addStop({ routeId, locationId: portC, stopOrder: 2, },);
    const ship = await makeLoc(worldId, "transport", "free", "ship",);
    await routes.attachTransport(ship, routeId,);
    testDb.sqlite.run(`UPDATE locations SET travel_progress = 1 WHERE id = ?`, [ship,],);
    await positions.deriveForTransport("npc-1", ship, routeId,);
    const pos = await positions.getPosition("npc-1",);
    expect(pos!.physicalLocationId,).toBe(ship,);
    expect(pos!.spatialLocationId,).toBe(portB,);
  });
});
