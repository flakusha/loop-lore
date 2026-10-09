// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { randomUUID, } from "node:crypto";
import { LocationEdgeMode, } from "../db/enums-story/world";
import { createTestDb, type TestDb, } from "../test-utils/create-test-db";
import {
  insertActorCurrencies,
  insertActorLocations,
  insertActors,
  insertLocationDiscovery,
  insertLocationEdges,
  insertLocations,
  insertUsers,
  insertWorlds,
} from "../test-utils/insert-helpers";
import {
  EDGE_MODE_SET,
  EDGE_MODES,
  type EdgeCost,
  LocationEdgeError,
  parseEdgeCost,
  sqlStamp,
} from "./edge-core";
import { forceDiscover, freeJumpOnCooldown, latchDiscovered, recordHop, worldGraph, } from "./edge-discovery";
import { LocationEdgeService, } from "./edge-graph";
import { EdgeTravelService, } from "./edge-travel";

let testDb: TestDb;

const OWNER = randomUUID();
const PLAYER = randomUUID();

/**
 * @param promise call expected to reject
 * @returns {Promise<LocationEdgeError>} the typed rejection
 */
async function rejectionFrom(promise: Promise<unknown>,): Promise<LocationEdgeError> {
  return await promise.then(
    () => {
      throw new Error("expected rejection",);
    },
    (error: unknown,) => error as LocationEdgeError,
  );
}

beforeAll(async () => {
  testDb = await createTestDb();
  await insertUsers(testDb.db, `owner-${OWNER.slice(0, 8,)}`, "Owner", { id: OWNER, },);
  await insertUsers(testDb.db, `player-${PLAYER.slice(0, 8,)}`, "Player", { id: PLAYER, },);
},);

afterAll(async () => {
  testDb.sqlite.close();
},);

/**
 * @returns fresh public world owned by OWNER
 */
async function makeWorld(): Promise<string> {
  const worldId = randomUUID();
  await insertWorlds(testDb.db, OWNER, `world-${worldId.slice(0, 8,)}`, { id: worldId, visibility: "public", },);
  return worldId;
}

/**
 * @param worldId parent world
 * @param name location name
 * @returns new location id
 */
async function makeLoc(worldId: string, name: string,): Promise<string> {
  return await insertLocations(testDb.db, worldId, name,);
}

/**
 * @returns a fresh actor bound to PLAYER
 */
async function makePlayerActor(): Promise<string> {
  return await insertActors(testDb.db, `actor-${PLAYER.slice(0, 8,)}`, { user_id: PLAYER, owner_id: PLAYER, },);
}

describe("edge-core helpers", () => {
  test("EDGE_MODES mirrors the enum and sqlStamp renders SQLite text", () => {
    expect(EDGE_MODES,).toEqual(Object.values(LocationEdgeMode,),);
    expect(EDGE_MODE_SET.has("walk",),).toBe(true,);
    expect(EDGE_MODE_SET.has("swim",),).toBe(false,);
    expect(sqlStamp(new Date(Date.UTC(2026, 9, 9, 1, 2, 3,),),),).toBe("2026-10-09 01:02:03",);
  });
});

describe("forceDiscover", () => {
  test("latches the pair and rejects unknown locations", async () => {
    const worldId = await makeWorld();
    const a = await makeLoc(worldId, "A",);
    const actorId = await makePlayerActor();

    await forceDiscover(testDb.db, worldId, a, actorId,);
    const latched = await testDb.db
      .selectFrom("location_discovery",)
      .selectAll()
      .where("actor_id", "=", actorId,)
      .executeTakeFirstOrThrow();

    expect(latched.location_id,).toBe(a,);
    expect(latched.discovered,).toBe(1,);

    const missing = await rejectionFrom(forceDiscover(testDb.db, worldId, randomUUID(), actorId,),);

    expect(missing.code,).toBe("not-found",);
  });
});

describe("parseEdgeCost", () => {
  test("undefined/null parse to an empty cost", () => {
    expect(parseEdgeCost(undefined,),).toEqual({},);
    expect(parseEdgeCost(null,),).toEqual({},);
  });

  test("known keys are kept and unknown keys rejected", () => {
    expect(parseEdgeCost({ gold: 5, itemId: "i1", cooldownHours: 2, requiresFactionStanding: "ally", },),).toEqual({
      gold: 5,
      itemId: "i1",
      cooldownHours: 2,
      requiresFactionStanding: "ally",
    },);

    expect(() => parseEdgeCost({ nope: 1, },)).toThrow(/unknown cost key/,);
    expect(() => parseEdgeCost([1, 2,],)).toThrow(/must be an object/,);
  });
});

describe("LocationEdgeService.createEdge", () => {
  test("creates a directed edge with defaults and rejects self/unknown/cross-world/duplicate", async () => {
    const worldId = await makeWorld();
    const a = await makeLoc(worldId, "A",);
    const b = await makeLoc(worldId, "B",);
    const svc = new LocationEdgeService(testDb.db,);

    const edge = await svc.createEdge(worldId, {
      fromId: a,
      toId: b,
      mode: "walk",
      gameHours: 2,
      requiresDiscovery: true,
      cost: { gold: 3, },
    },);

    expect(edge.from_id,).toBe(a,);
    expect(edge.to_id,).toBe(b,);
    expect(edge.mode,).toBe("walk",);
    expect(edge.game_hours,).toBe(2,);
    expect(edge.requires_discovery,).toBe(1,);
    expect(JSON.parse(edge.cost_json,),).toEqual({ gold: 3, },);

    const selfErr = await rejectionFrom(svc.createEdge(worldId, { fromId: a, toId: a, mode: "walk", },),);
    const missingErr = await rejectionFrom(svc.createEdge(worldId, { fromId: a, toId: randomUUID(), mode: "walk", },),);
    const otherWorld = await makeWorld();
    const otherLoc = await makeLoc(otherWorld, "C",);
    const crossErr = await rejectionFrom(svc.createEdge(worldId, { fromId: a, toId: otherLoc, mode: "walk", },),);
    const dupeErr = await rejectionFrom(svc.createEdge(worldId, { fromId: a, toId: b, mode: "walk", },),);

    expect(selfErr.code,).toBe("self",);
    expect(missingErr.code,).toBe("not-found",);
    expect(crossErr.code,).toBe("cross-world",);
    expect(dupeErr.code,).toBe("duplicate",);
  });
});

describe("LocationEdgeService.updateEdge", () => {
  test("patches fields and rejects unknown edge/mode/cost", async () => {
    const worldId = await makeWorld();
    const a = await makeLoc(worldId, "A",);
    const b = await makeLoc(worldId, "B",);
    const svc = new LocationEdgeService(testDb.db,);
    const edgeId = await insertLocationEdges(testDb.db, worldId, a, b,);

    const updated = await svc.updateEdge(worldId, edgeId, { gameHours: 7, mode: "fly", },);
    expect(updated.game_hours,).toBe(7,);
    expect(updated.mode,).toBe("fly",);

    await expect(svc.updateEdge(worldId, randomUUID(), { gameHours: 1, },),).rejects.toThrow(/Edge not found/,);
    await expect(svc.updateEdge(worldId, edgeId, { mode: "swim" as never, },),).rejects.toThrow(/unknown edge mode/,);
    await expect(svc.updateEdge(worldId, edgeId, { cost: { nope: 1, } as EdgeCost, },),).rejects.toThrow(
      /unknown cost key/,
    );
  });
});

describe("LocationEdgeService reads", () => {
  test("edgesAt is bidirectional and edgeById is world-scoped", async () => {
    const worldId = await makeWorld();
    const a = await makeLoc(worldId, "A",);
    const b = await makeLoc(worldId, "B",);
    const c = await makeLoc(worldId, "C",);
    const svc = new LocationEdgeService(testDb.db,);
    const ab = await insertLocationEdges(testDb.db, worldId, a, b,);
    const ca = await insertLocationEdges(testDb.db, worldId, c, a,);

    const atA = await svc.edgesAt(a,);
    expect(atA.map((e,) => e.id).sort(),).toEqual([ab, ca,].sort(),);

    expect((await svc.edgeById(worldId, ab,))?.id,).toBe(ab,);
    expect(await svc.edgeById(randomUUID(), ab,),).toBeUndefined();
  });

  test("worldGraph hides locked edges from the actor view until both endpoints are discovered", async () => {
    const worldId = await makeWorld();
    const a = await makeLoc(worldId, "A",);
    const b = await makeLoc(worldId, "B",);
    const c = await makeLoc(worldId, "C",);
    const lockedAB = await insertLocationEdges(testDb.db, worldId, a, b, { requires_discovery: 1, },);
    await insertLocationEdges(testDb.db, worldId, a, c, { requires_discovery: 0, },);

    const actorId = await makePlayerActor();
    expect((await worldGraph(testDb.db, worldId, actorId,)).map((e,) => e.id),).not.toContain(lockedAB,);

    await latchDiscovered(testDb.db, worldId, a, actorId,);
    expect((await worldGraph(testDb.db, worldId, actorId,)).map((e,) => e.id),).not.toContain(lockedAB,);

    await latchDiscovered(testDb.db, worldId, b, actorId,);
    expect((await worldGraph(testDb.db, worldId, actorId,)).map((e,) => e.id),).toContain(lockedAB,);

    expect((await worldGraph(testDb.db, worldId, null,)).length,).toBe(2,);
  });
});

describe("discovery latch + hop log", () => {
  test("latchDiscovered updates existing rows and inserts missing ones; recordHop logs a row", async () => {
    const worldId = await makeWorld();
    const a = await makeLoc(worldId, "A",);
    const b = await makeLoc(worldId, "B",);
    const actorId = await makePlayerActor();
    const edgeId = await insertLocationEdges(testDb.db, worldId, a, b,);

    await insertLocationDiscovery(testDb.db, worldId, a, actorId, { discovered: 0, },);
    await latchDiscovered(testDb.db, worldId, a, actorId,);
    await latchDiscovered(testDb.db, worldId, b, actorId,);

    const rows = await testDb.db
      .selectFrom("location_discovery",)
      .selectAll()
      .where("actor_id", "=", actorId,)
      .execute();

    expect(rows.map((r,) => r.location_id).sort(),).toEqual([a, b,].sort(),);
    expect(rows.every((r,) => r.discovered === 1),).toBe(true,);

    await recordHop(testDb.db, worldId, edgeId, actorId, "walk", a, b,);
    const hops = await testDb.db.selectFrom("world_event_log",).selectAll().execute();
    expect(hops.length,).toBe(1,);
    expect(hops[0]!.subject_id,).toBe(edgeId,);
    expect(hops[0]!.actor_id,).toBe(actorId,);
    expect(JSON.parse(hops[0]!.payload,),).toEqual({ from: a, to: b, mode: "walk", },);
  });
});

describe("free-jump cooldown", () => {
  test("is true inside the window and false outside it", async () => {
    const worldId = await makeWorld();
    const a = await makeLoc(worldId, "A",);
    const b = await makeLoc(worldId, "B",);
    const actorId = await makePlayerActor();
    const edgeId = await insertLocationEdges(testDb.db, worldId, a, b,);

    expect(await freeJumpOnCooldown(testDb.db, worldId, edgeId, actorId, 1,),).toBe(false,);

    await recordHop(testDb.db, worldId, edgeId, actorId, "free-jump", a, b,);
    expect(await freeJumpOnCooldown(testDb.db, worldId, edgeId, actorId, 1,),).toBe(true,);
    expect(await freeJumpOnCooldown(testDb.db, worldId, edgeId, actorId, 0,),).toBe(false,);
    expect(await freeJumpOnCooldown(testDb.db, worldId, edgeId, randomUUID(), 1,),).toBe(false,);
  });
});

describe("EdgeTravelService.travel", () => {
  test("walk hop moves the actor and latches discovery without charging gold", async () => {
    const worldId = await makeWorld();
    const a = await makeLoc(worldId, "A",);
    const b = await makeLoc(worldId, "B",);
    const travel = new EdgeTravelService(testDb.db,);
    const actorId = await makePlayerActor();
    await insertActorLocations(testDb.db, a, a, { actor_id: actorId, },);
    const edgeId = await insertLocationEdges(testDb.db, worldId, a, b, { mode: "walk", },);
    await insertActorCurrencies(testDb.db, actorId, worldId, "gold", { balance: 10, },);

    const outcome = await travel.travel({
      worldId,
      fromId: a,
      toId: b,
      mode: "walk",
      actorId,
      bypassDiscovery: false,
    },);

    expect(outcome,).toEqual({ edgeId, actorId, toId: b, mode: "walk", goldCharged: null, },);

    const placed = await testDb.db
      .selectFrom("actor_locations",)
      .selectAll()
      .where("actor_id", "=", actorId,)
      .executeTakeFirstOrThrow();

    expect(placed.physical_location_id,).toBe(b,);
    expect(placed.spatial_location_id,).toBe(b,);

    const wallet = await testDb.db
      .selectFrom("actor_currencies",)
      .select("balance",)
      .where("actor_id", "=", actorId,)
      .executeTakeFirstOrThrow();

    expect(wallet.balance,).toBe(10,);
    expect(edgeId,).not.toBe("",);
  });

  test("locked edge is refused until discovered, then passes", async () => {
    const worldId = await makeWorld();
    const a = await makeLoc(worldId, "A",);
    const b = await makeLoc(worldId, "B",);
    const travel = new EdgeTravelService(testDb.db,);
    const actorId = await makePlayerActor();
    await insertLocationEdges(testDb.db, worldId, a, b, { requires_discovery: 1, },);
    const base = {
      worldId,
      fromId: a,
      toId: b,
      mode: "walk",
      actorId,
      bypassDiscovery: false,
    };

    const locked = await rejectionFrom(travel.travel({ ...base, },),);
    expect(locked.code,).toBe("not-yet-discovered",);

    await latchDiscovered(testDb.db, worldId, a, actorId,);
    await latchDiscovered(testDb.db, worldId, b, actorId,);
    const outcome = await travel.travel({ ...base, },);
    expect(outcome.toId,).toBe(b,);
  });

  test("bypassDiscovery lets a GM hop a locked edge", async () => {
    const worldId = await makeWorld();
    const a = await makeLoc(worldId, "A",);
    const b = await makeLoc(worldId, "B",);
    const travel = new EdgeTravelService(testDb.db,);
    const actorId = await makePlayerActor();
    await insertLocationEdges(testDb.db, worldId, a, b, { requires_discovery: 1, },);

    const outcome = await travel.travel({
      worldId,
      fromId: a,
      toId: b,
      mode: "walk",
      actorId,
      bypassDiscovery: true,
    },);

    expect(outcome.toId,).toBe(b,);
  });

  test("free-jump charges gold and enforces cooldown; unknown edge/mode rejected", async () => {
    const worldId = await makeWorld();
    const a = await makeLoc(worldId, "A",);
    const b = await makeLoc(worldId, "B",);
    const travel = new EdgeTravelService(testDb.db,);
    const actorId = await makePlayerActor();
    await insertLocationEdges(testDb.db, worldId, a, b, {
      mode: "free-jump",
      cost_json: JSON.stringify({ gold: 4, cooldownHours: 1, },),
    },);

    await insertActorCurrencies(testDb.db, actorId, worldId, "gold", { balance: 10, },);
    const base = {
      worldId,
      fromId: a,
      toId: b,
      mode: "free-jump",
      actorId,
      bypassDiscovery: false,
    };

    const first = await travel.travel({ ...base, },);
    expect(first.goldCharged,).toBe(4,);
    const wallet = await testDb.db
      .selectFrom("actor_currencies",)
      .select("balance",)
      .where("actor_id", "=", actorId,)
      .executeTakeFirstOrThrow();

    expect(wallet.balance,).toBe(6,);

    const cooldownErr = await rejectionFrom(travel.travel({ ...base, },),);
    expect(cooldownErr.code,).toBe("cooldown",);

    const poor = await makePlayerActor();
    await insertActorCurrencies(testDb.db, poor, worldId, "gold", { balance: 1, },);
    const poorErr = await rejectionFrom(travel.travel({ ...base, actorId: poor, },),);
    expect(poorErr.code,).toBe("insufficient",);

    const unknownTo = await rejectionFrom(travel.travel({ ...base, actorId, toId: randomUUID(), },),);
    const unknownMode = await rejectionFrom(travel.travel({ ...base, actorId, mode: "swim", },),);
    expect(unknownTo.code,).toBe("not-found",);
    expect(unknownMode.code,).toBe("not-found",);
  });

  test("free-jump without cost config hops for free", async () => {
    const worldId = await makeWorld();
    const a = await makeLoc(worldId, "A",);
    const b = await makeLoc(worldId, "B",);
    const travel = new EdgeTravelService(testDb.db,);
    const actorId = await makePlayerActor();
    await insertLocationEdges(testDb.db, worldId, a, b, { mode: "free-jump", },);

    const outcome = await travel.travel({
      worldId,
      fromId: a,
      toId: b,
      mode: "free-jump",
      actorId,
      bypassDiscovery: false,
    },);

    expect(outcome.goldCharged,).toBeNull();
  });
});
