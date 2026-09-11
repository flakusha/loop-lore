// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for processMovementTick.
 * Real in-memory DB via createTestDb + insert-* helpers.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema.js";
import { createTestDb, } from "../../../test-utils/create-test-db.js";
import {
  insertActors,
  insertLocations,
  insertLocationStates,
  insertNpcStates,
  insertUsers,
  insertWorlds,
} from "../../../test-utils/insert-helpers.js";
import { uid, } from "../../../utils.js";
import { processMovementTick, } from "./processing.js";
import { MovementPattern, } from "./types.js";

let db: Kysely<DB>;

async function makeWorld(name: string,) {
  const ownerId = uid();
  const worldId = uid();
  await insertUsers(db, "owner-" + ownerId, "Owner " + name, { id: ownerId, },);
  await insertWorlds(db, ownerId, name, { id: worldId, },);
  return { ownerId, worldId, };
}

async function makeLocation(worldId: string, name: string,) {
  const locationId = uid();
  await insertLocations(db, worldId, name, { id: locationId, },);
  await insertLocationStates(db, locationId, worldId,);
  return locationId;
}

async function makeNpc(
  worldId: string,
  locationId: string,
  opts?: {
    movementPattern?: (typeof MovementPattern)[keyof typeof MovementPattern];
    patrolRoute?: string[];
    patrolIndex?: number;
    followTargetId?: string;
  },
) {
  const actorId = uid();
  await insertActors(db, "NPC " + actorId, {
    id: actorId,
    actor_type: "character",
  },);
  const schedule: Record<string, unknown> = {};
  if (opts?.movementPattern) { schedule.movementPattern = opts.movementPattern; }
  if (opts?.patrolRoute) { schedule.patrolRoute = opts.patrolRoute; }
  if (opts?.patrolIndex !== undefined) { schedule.patrolIndex = opts.patrolIndex; }
  if (opts?.followTargetId) { schedule.followTargetId = opts.followTargetId; }
  await insertNpcStates(db, actorId, worldId, {
    location_id: locationId,
    schedule: JSON.stringify(schedule,),
  },);
  return actorId;
}

beforeEach(async () => {
  ({ db, } = await createTestDb());
},);

afterEach(async () => {
  await db.destroy();
},);

describe("processMovementTick", () => {
  test("world with zero NPCs returns empty array", async () => {
    const { worldId, } = await makeWorld("empty",);
    const results = await processMovementTick(db, worldId,);
    expect(results,).toEqual([],);
  });

  test("world with only Stationary NPCs returns empty array", async () => {
    const { worldId, } = await makeWorld("stationary-only",);
    const loc = await makeLocation(worldId, "square",);
    await makeNpc(worldId, loc, { movementPattern: MovementPattern.Stationary, },);
    const results = await processMovementTick(db, worldId,);
    expect(results,).toEqual([],);
  });

  test("malformed schedule JSON does not throw — treated as empty schedule", async () => {
    const { worldId, } = await makeWorld("malformed-schedule",);
    const loc = await makeLocation(worldId, "hall",);
    const actorId = uid();
    await insertActors(db, "Malformed", {
      id: actorId,
      actor_type: "character",
    },);
    await insertNpcStates(db, actorId, worldId, {
      location_id: loc,
      schedule: "not valid json {{{",
    },);
    const results = await processMovementTick(db, worldId,);
    expect(results,).toEqual([],);
  });

  test("patrol NPC with another location in the same world moves to that location", async () => {
    const { worldId, } = await makeWorld("patrol-world",);
    const locA = await makeLocation(worldId, "gate",);
    const locB = await makeLocation(worldId, "tower",);
    const actorId = await makeNpc(worldId, locA, {
      movementPattern: MovementPattern.Patrol,
      patrolRoute: [locA, locB,],
      patrolIndex: 0,
    },);
    const results = await processMovementTick(db, worldId,);
    expect(results,).toHaveLength(1,);
    expect(results[0]!.actorId,).toBe(actorId,);
    expect(results[0]!.success,).toBe(true,);
    expect(results[0]!.fromLocationId,).toBe(locA,);
    expect(results[0]!.toLocationId,).toBe(locB,);
    expect(results[0]!.pattern,).toBe(MovementPattern.Patrol,);
  });

  test("cross-world isolation — NPCs in world A not processed when calling tick for world B", async () => {
    const { worldId: worldA, } = await makeWorld("world-a",);
    const { worldId: worldB, } = await makeWorld("world-b",);
    const locA = await makeLocation(worldA, "cafe",);
    await makeLocation(worldA, "garden",);
    const locB = await makeLocation(worldB, "pub",);
    await makeNpc(worldA, locA, { movementPattern: MovementPattern.Wander, },);
    await makeNpc(worldB, locB, { movementPattern: MovementPattern.Wander, },);
    const resultsA = await processMovementTick(db, worldA,);
    expect(resultsA,).toHaveLength(1,);
    expect(resultsA[0]!.actorId,).not.toBeNull();
  });

  test("wander NPC with no connected locations returns null", async () => {
    const { worldId, } = await makeWorld("wander-isolated",);
    const loc = await makeLocation(worldId, "nowhere",);
    await makeNpc(worldId, loc, { movementPattern: MovementPattern.Wander, },);
    const results = await processMovementTick(db, worldId,);
    expect(results,).toEqual([],);
  });

  test("wander NPC with connected locations moves to one of them", async () => {
    const { worldId, } = await makeWorld("wander-world",);
    const loc = await makeLocation(worldId, "crossroads",);
    await makeLocation(worldId, "forest",);
    await makeLocation(worldId, "village",);
    const actorId = await makeNpc(worldId, loc, {
      movementPattern: MovementPattern.Wander,
    },);
    const results = await processMovementTick(db, worldId,);
    expect(results,).toHaveLength(1,);
    expect(results[0]!.actorId,).toBe(actorId,);
    expect(results[0]!.success,).toBe(true,);
    expect(results[0]!.pattern,).toBe(MovementPattern.Wander,);
    expect(results[0]!.fromLocationId,).toBe(loc,);
    expect(results[0]!.toLocationId,).not.toBe(loc,);
  });

  test("follow NPC moves to target when target is at different location", async () => {
    const { worldId, } = await makeWorld("follow-success",);
    const locA = await makeLocation(worldId, "market",);
    const locB = await makeLocation(worldId, "plaza",);
    const targetId = await makeNpc(worldId, locB, {
      movementPattern: MovementPattern.Stationary,
    },);
    const followerId = await makeNpc(worldId, locA, {
      movementPattern: MovementPattern.Follow,
      followTargetId: targetId,
    },);
    const results = await processMovementTick(db, worldId,);
    expect(results,).toHaveLength(1,);
    expect(results[0]!.actorId,).toBe(followerId,);
    expect(results[0]!.success,).toBe(true,);
    expect(results[0]!.fromLocationId,).toBe(locA,);
    expect(results[0]!.toLocationId,).toBe(locB,);
    expect(results[0]!.pattern,).toBe(MovementPattern.Follow,);
  });

  test("follow NPC with missing followTargetId returns null", async () => {
    const { worldId, } = await makeWorld("follow-no-target",);
    const loc = await makeLocation(worldId, "square",);
    await makeNpc(worldId, loc, {
      movementPattern: MovementPattern.Follow,
    },);
    const results = await processMovementTick(db, worldId,);
    expect(results,).toEqual([],);
  });

  test("follow NPC already at target location returns null", async () => {
    const { worldId, } = await makeWorld("follow-same-loc",);
    const loc = await makeLocation(worldId, "market",);
    const targetId = await makeNpc(worldId, loc, {
      movementPattern: MovementPattern.Stationary,
    },);
    await makeNpc(worldId, loc, {
      movementPattern: MovementPattern.Follow,
      followTargetId: targetId,
    },);
    const results = await processMovementTick(db, worldId,);
    expect(results,).toEqual([],);
  });

  test("flee NPC with connected locations moves to one of them", async () => {
    const { worldId, } = await makeWorld("flee-world",);
    const loc = await makeLocation(worldId, "bridge",);
    await makeLocation(worldId, "cave",);
    await makeLocation(worldId, "tower",);
    const actorId = await makeNpc(worldId, loc, {
      movementPattern: MovementPattern.Flee,
    },);
    const results = await processMovementTick(db, worldId,);
    expect(results,).toHaveLength(1,);
    expect(results[0]!.actorId,).toBe(actorId,);
    expect(results[0]!.success,).toBe(true,);
    expect(results[0]!.pattern,).toBe(MovementPattern.Flee,);
    expect(results[0]!.fromLocationId,).toBe(loc,);
    expect(results[0]!.toLocationId,).not.toBe(loc,);
  });
});
