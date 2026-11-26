// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Fractal-locations invariants tests — DB triggers + service-layer rules
 * owned by 011_locations_factions_npc in the consolidated migration chain
 * (INSERT guards, UPDATE twins, depth ceiling). Each invariant below has an
 * explicit "what happens if it's violated" assertion so a regression to the
 * underlying trigger or service code surfaces immediately.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { randomUUID, } from "node:crypto";
import { ActorPositionService, } from "../locations/positions";
import { TravelRouteService, } from "../locations/routes";
import { LocationTreeService, } from "../locations/tree";
import { createTestDb, resetTestDb, type TestDb, } from "../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../test-utils/insert-helpers";

let testDb: TestDb;
const OWNER = "fractal-inv-owner";
async function makeWorld(): Promise<string> {
  const worldId = randomUUID();
  await insertWorlds(testDb.db, OWNER, `world-${worldId.slice(0, 8,)}`, { id: worldId, },);
  return worldId;
}

async function rawInsertLoc(worldId: string, parentId: string | null = null, name = "loc",): Promise<string> {
  const id = randomUUID();
  testDb.sqlite.run(
    `INSERT INTO locations (id, world_id, name, description, connections, publication_status, parent_location_id)
     VALUES (?, ?, ?, '', '[]', 'draft', ?)`,
    [id, worldId, name, parentId,],
  );

  return id;
}

const NEW_TRIGGERS = [
  "trg_locations_no_self_parent_on_update",
  "trg_locations_cross_world_parent_on_update",
  "trg_locations_depth_limit_on_insert",
  "trg_locations_depth_limit_on_update",
] as const;

/** Raw inserts so the depth tests exercise the trigger, not the service. */
async function rawChain(worldId: string, depth: number,): Promise<string[]> {
  const ids: string[] = [];
  let parent: string | null = null;
  for (let i = 0; i < depth; i += 1) {
    parent = await rawInsertLoc(worldId, parent, `chain-${i}`,);
    ids.push(parent,);
  }

  return ids;
}

function integrityTriggers(sqlite: TestDb["sqlite"],): string[] {
  return (sqlite.query(
    `SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_locations_%'`,
  ).all() as { name: string }[])
    .map((row,) => row.name)
    .filter((name,) => (NEW_TRIGGERS as readonly string[]).includes(name,))
    .sort();
}

beforeAll(async () => {
  testDb = await createTestDb();
  await insertUsers(testDb.db, OWNER, "Owner", { id: OWNER, },);
},);

afterAll(async () => {
  await testDb.db.destroy();
  testDb.sqlite.close();
},);

describe("fractal locations invariants", () => {
  beforeEach(async () => {
    await resetTestDb(testDb.sqlite,);
    await insertUsers(testDb.db, OWNER, "Owner", { id: OWNER, },);
  },);

  test("trigger: rejects self-parent on insert", async () => {
    const worldId = await makeWorld();
    const id = randomUUID();
    expect(() =>
      testDb.sqlite.run(
        `INSERT INTO locations (id, world_id, name, description, connections, publication_status, parent_location_id)
       VALUES (?, ?, 'x', '', '[]', 'draft', ?)`,
        [id, worldId, id,],
      )
    ).toThrow();
  });

  test("trigger: rejects cross-world parent", async () => {
    const wA = await makeWorld();
    const wB = await makeWorld();
    const parentInB = await rawInsertLoc(wB, null, "p",);
    expect(() =>
      testDb.sqlite.run(
        `INSERT INTO locations (id, world_id, name, description, connections, publication_status, parent_location_id)
       VALUES (?, ?, 'x', '', '[]', 'draft', ?)`,
        [randomUUID(), wA, parentInB,],
      )
    ).toThrow(/cross.world/i,);
  });

  test("trigger: path materializes on insert for root and child", async () => {
    const worldId = await makeWorld();
    const root = await rawInsertLoc(worldId, null, "R",);
    const child = await rawInsertLoc(worldId, root, "C",);
    const gc = await rawInsertLoc(worldId, child, "GC",);
    const get = (id: string,): { path: string } =>
      testDb.sqlite.query(`SELECT path FROM locations WHERE id = ?`,).get(id,) as { path: string };

    expect(get(root,).path,).toBe(`/${root}/`,);
    expect(get(child,).path,).toBe(`/${root}/${child}/`,);
    expect(get(gc,).path,).toBe(`/${root}/${child}/${gc}/`,);
  });

  test("trigger: path rewrites on parent_location_id update", async () => {
    const worldId = await makeWorld();
    const r1 = await rawInsertLoc(worldId, null, "r1",);
    const r2 = await rawInsertLoc(worldId, null, "r2",);
    const c = await rawInsertLoc(worldId, r1, "c",);
    testDb.sqlite.run(`UPDATE locations SET parent_location_id = ? WHERE id = ?`, [r2, c,],);
    const row = testDb.sqlite.query(`SELECT path FROM locations WHERE id = ?`,).get(c,) as { path: string };
    expect(row.path,).toBe(`/${r2}/${c}/`,);
  });

  test("service: rejects move that would create a cycle", async () => {
    const worldId = await makeWorld();
    const tree = new LocationTreeService(testDb.db,);
    const a = await rawInsertLoc(worldId, null, "a",);
    const b = await rawInsertLoc(worldId, a, "b",);
    const c = await rawInsertLoc(worldId, b, "c",);
    await expect(tree.moveSubtree(b, c,),).rejects.toThrow(/cycle/i,);
  });

  test("service: rejects move across worlds", async () => {
    const wA = await makeWorld();
    const wB = await makeWorld();
    const tree = new LocationTreeService(testDb.db,);
    const a = await rawInsertLoc(wA, null, "a",);
    const b = await rawInsertLoc(wB, null, "b",);
    await expect(tree.moveSubtree(a, b,),).rejects.toThrow(/cross.world/i,);
  });

  test("routes: rejects cross-world stop", async () => {
    const wA = await makeWorld();
    const wB = await makeWorld();
    const routes = new TravelRouteService(testDb.db,);
    const routeId = await routes.createRoute({
      worldId: wA,
      name: "Coast",
      kind: "sea",
      loop: false,
      secondsPerUnit: 60,
    },);

    const stopInB = await rawInsertLoc(wB, null, "foreign",);
    await expect(routes.addStop({ routeId, locationId: stopInB, stopOrder: 0, },),).rejects.toThrow(/world/i,);
  });

  test("routes: stops order is unique per route", async () => {
    const worldId = await makeWorld();
    const routes = new TravelRouteService(testDb.db,);
    const routeId = await routes.createRoute({
      worldId,
      name: "Coast",
      kind: "sea",
      loop: false,
      secondsPerUnit: 60,
    },);

    const a = await rawInsertLoc(worldId, null, "a",);
    const b = await rawInsertLoc(worldId, null, "b",);
    await routes.addStop({ routeId, locationId: a, stopOrder: 0, },);
    await expect(routes.addStop({ routeId, locationId: b, stopOrder: 0, },),).rejects.toThrow();
  });

  test("positions: rejects actor placement in two different worlds", async () => {
    const wA = await makeWorld();
    const wB = await makeWorld();
    const positions = new ActorPositionService(testDb.db,);
    const a = await rawInsertLoc(wA, null, "a",);
    const b = await rawInsertLoc(wB, null, "b",);
    await expect(positions.setPosition("actor-1", a, b,),).rejects.toThrow(/world/i,);
  });

  test("positions: same physical and spatial is allowed (static location)", async () => {
    const worldId = await makeWorld();
    const positions = new ActorPositionService(testDb.db,);
    const a = await rawInsertLoc(worldId, null, "a",);
    await positions.setPosition("actor-1", a, a,);
    const pos = await positions.getPosition("actor-1",);
    expect(pos,).not.toBeNull();
    expect(pos!.physicalLocationId,).toBe(a,);
    expect(pos!.spatialLocationId,).toBe(a,);
  });

  test("attach: transport must be in the same world as the route", async () => {
    const wA = await makeWorld();
    const wB = await makeWorld();
    const routes = new TravelRouteService(testDb.db,);
    const routeId = await routes.createRoute({
      worldId: wA,
      name: "Coast",
      kind: "sea",
      loop: false,
      secondsPerUnit: 60,
    },);

    const shipInB = await rawInsertLoc(wB, null, "ship",);
    testDb.sqlite.run(`UPDATE locations SET kind = 'transport', mobility_mode = 'free' WHERE id = ?`, [shipInB,],);
    await expect(routes.attachTransport(shipInB, routeId,),).rejects.toThrow(/world/i,);
  });

  test("attach: only kind=transport with mobility_mode != 'static' may attach", async () => {
    const worldId = await makeWorld();
    const routes = new TravelRouteService(testDb.db,);
    const routeId = await routes.createRoute({
      worldId,
      name: "Coast",
      kind: "sea",
      loop: false,
      secondsPerUnit: 60,
    },);

    const ship = await rawInsertLoc(worldId, null, "ship",);
    await expect(routes.attachTransport(ship, routeId,),).rejects.toThrow(/transport|mobility/i,);
  });

  test("trigger: rejects self-parent on UPDATE", async () => {
    const worldId = await makeWorld();
    const id = await rawInsertLoc(worldId, null, "self",);
    expect(() => testDb.sqlite.run(`UPDATE locations SET parent_location_id = ? WHERE id = ?`, [id, id,],)).toThrow(
      /own parent/i,
    );
  });

  test("trigger: rejects cross-world parent on UPDATE", async () => {
    const wA = await makeWorld();
    const wB = await makeWorld();
    const a = await rawInsertLoc(wA, null, "a",);
    const b = await rawInsertLoc(wB, null, "b",);
    expect(() => testDb.sqlite.run(`UPDATE locations SET parent_location_id = ? WHERE id = ?`, [b, a,],)).toThrow(
      /cross.world/i,
    );
  });

  test("trigger: rejects depth 13 on INSERT", async () => {
    const worldId = await makeWorld();
    const chain = await rawChain(worldId, 12,);
    const deepest = chain[chain.length - 1]!;
    const row = testDb.sqlite.query(`SELECT path FROM locations WHERE id = ?`,).get(deepest,) as { path: string };
    // depth = separators - 1; the 12th level is still inside the limit.
    expect(row.path.split("/",).length - 2,).toBe(12,);
    await expect(rawInsertLoc(worldId, deepest, "too-deep",),).rejects.toThrow(/depth exceeds limit/i,);
  });

  test("trigger: rejects depth 13 on UPDATE", async () => {
    const worldId = await makeWorld();
    const chain = await rawChain(worldId, 12,);
    const deepest = chain[chain.length - 1]!;
    const subtree = await rawInsertLoc(worldId, null, "subtree",);
    expect(() => testDb.sqlite.run(`UPDATE locations SET parent_location_id = ? WHERE id = ?`, [deepest, subtree,],))
      .toThrow(/depth exceeds limit/i,);
  });

  test("trigger: valid reparent still rewrites descendant paths", async () => {
    const worldId = await makeWorld();
    const r1 = await rawInsertLoc(worldId, null, "r1",);
    const r2 = await rawInsertLoc(worldId, null, "r2",);
    const child = await rawInsertLoc(worldId, r1, "c",);
    const gc = await rawInsertLoc(worldId, child, "gc",);
    testDb.sqlite.run(`UPDATE locations SET parent_location_id = ? WHERE id = ?`, [r2, child,],);
    const paths = new Map(
      (testDb.sqlite.query(`SELECT id, path FROM locations`,).all() as { id: string; path: string }[])
        .map((row,) => [row.id, row.path,] as const),
    );

    expect(paths.get(child,),).toBe(`/${r2}/${child}/`,);
    expect(paths.get(gc,),).toBe(`/${r2}/${child}/${gc}/`,);
  });

  test("final DB carries exactly the four integrity triggers", () => {
    const expected = [...NEW_TRIGGERS,].sort();
    expect(integrityTriggers(testDb.sqlite,),).toEqual(expected,);
  });
});
