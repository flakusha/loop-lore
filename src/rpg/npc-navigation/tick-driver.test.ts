// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NPC navigation tick driver tests.
 *
 * Covers:
 *   - happy path: dispatches to processMovementTick once
 *   - paused: skips before touching DB / governor
 *   - jitter: drops ticks based on cfg.jitterRatio via injected rng
 *   - disabled: skips when autonomy disabled in config
 *   - budget: governor denies after per_tick_action cap exhausts
 *   - cadence: repeated calls at scheduled intervals fire repeatedly
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { AutonomyGovernor, } from "../../autonomy/governor";
import type { DB, } from "../../db/schema.js";
import { createTestDb, } from "../../test-utils/create-test-db.js";
import {
  insertActors,
  insertChats,
  insertLocations,
  insertLocationStates,
  insertNpcStates,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers.js";
import { uid, } from "../../utils.js";
import { MovementPattern, } from "./service/types.js";
import { runNpcMovementTick, } from "./tick-driver";

let db: Kysely<DB>;

async function makeWorld(name: string,) {
  const ownerId = uid();
  const worldId = uid();
  await insertUsers(db, "owner-" + ownerId, "Owner " + name, { id: ownerId, },);
  await insertWorlds(db, ownerId, name, { id: worldId, },);
  return { ownerId, worldId, };
}

async function makeChat(worldId: string, ownerId: string,) {
  const chatId = uid();
  await insertChats(db, "chat-" + chatId, ownerId, { id: chatId, world_id: worldId, },);
  return chatId;
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
  await insertNpcStates(db, actorId, worldId, {
    location_id: locationId,
    schedule: JSON.stringify(schedule,),
  },);
  return actorId;
}

/** Always-firing RNG (never below any positive jitterRatio). */
const RNG_FIRES = (): number => 1;
/** Always-skipping RNG (always below any positive jitterRatio). */
const RNG_SKIPS = (): number => 0;

beforeEach(async () => {
  ({ db, } = await createTestDb());
},);

afterEach(async () => {
  await db.destroy();
},);

describe("runNpcMovementTick", () => {
  test("happy path: dispatches to processMovementTick and returns results", async () => {
    const { ownerId, worldId, } = await makeWorld("happy",);
    const chatId = await makeChat(worldId, ownerId,);
    const locA = await makeLocation(worldId, "a",);
    const locB = await makeLocation(worldId, "b",);
    const actorId = await makeNpc(worldId, locA, {
      movementPattern: MovementPattern.Patrol,
      patrolRoute: [locA, locB,],
      patrolIndex: 0,
    },);

    const out = await runNpcMovementTick(db, worldId, {
      chatId,
      rng: RNG_FIRES,
      governor: new AutonomyGovernor(),
    },);

    expect("results" in out,).toBe(true,);
    if ("results" in out) {
      expect(out.results,).toHaveLength(1,);
      expect(out.results[0]!.actorId,).toBe(actorId,);
      expect(out.results[0]!.success,).toBe(true,);
      expect(out.preset,).toBe("organic",);
      expect(out.jitterRatio,).toBeGreaterThan(0,);
    }
  });

  test("paused: skips without touching DB or governor", async () => {
    const { ownerId, worldId, } = await makeWorld("paused",);
    const chatId = await makeChat(worldId, ownerId,);
    const loc = await makeLocation(worldId, "square",);
    await makeNpc(worldId, loc, { movementPattern: MovementPattern.Stationary, },);

    // Spy: governor's tryConsume MUST NOT be called.
    let governorCalls = 0;
    const governor = new AutonomyGovernor();
    const realTry = governor.tryConsume.bind(governor,);
    governor.tryConsume = async (...args) => {
      governorCalls++;
      return realTry(...args,);
    };

    const out = await runNpcMovementTick(db, worldId, {
      chatId,
      paused: true,
      governor,
    },);

    expect(out,).toEqual({ skipped: "paused", },);
    expect(governorCalls,).toBe(0,);
  });

  test("disabled config: skips when autonomy is disabled", async () => {
    const { ownerId, worldId, } = await makeWorld("disabled",);
    const chatId = await makeChat(worldId, ownerId,);
    // Disable autonomy at world layer.
    await db
      .updateTable("worlds",)
      .set({ autonomy_config: JSON.stringify({ enabled: false, },), },)
      .where("id", "=", worldId,)
      .execute();

    const out = await runNpcMovementTick(db, worldId, {
      chatId,
      rng: RNG_FIRES,
    },);

    expect("skipped" in out && out.skipped,).toBe("disabled",);
    if ("skipped" in out && out.skipped === "disabled") {
      expect(out.preset,).toBe("organic",);
    }
  });

  test("jitter: rng below jitterRatio returns skipped: 'jitter'", async () => {
    const { ownerId, worldId, } = await makeWorld("jitter",);
    const chatId = await makeChat(worldId, ownerId,);
    const loc = await makeLocation(worldId, "a",);
    await makeNpc(worldId, loc, {
      movementPattern: MovementPattern.Stationary,
    },);

    // organic preset has jitterRatio = 0.5; RNG_SKIPS returns 0 < 0.5 → skip.
    const out = await runNpcMovementTick(db, worldId, {
      chatId,
      rng: RNG_SKIPS,
    },);

    expect("skipped" in out && out.skipped,).toBe("jitter",);
    if ("skipped" in out && out.skipped === "jitter") {
      expect(out.jitterRatio,).toBeGreaterThan(0,);
    }
  });

  test("jitter: rng above jitterRatio lets the tick fire", async () => {
    const { ownerId, worldId, } = await makeWorld("jitter-fire",);
    const chatId = await makeChat(worldId, ownerId,);
    const loc = await makeLocation(worldId, "x",);
    await makeNpc(worldId, loc, {
      movementPattern: MovementPattern.Stationary,
    },);

    const out = await runNpcMovementTick(db, worldId, {
      chatId,
      rng: RNG_FIRES, // 1.0 > any jitterRatio in [0, 1]
    },);

    expect("results" in out,).toBe(true,);
  });

  test("budget: governor denies after per_tick_action cap exhausts", async () => {
    const { ownerId, worldId, } = await makeWorld("budget",);
    const chatId = await makeChat(worldId, ownerId,);
    const loc = await makeLocation(worldId, "p",);
    await makeNpc(worldId, loc, { movementPattern: MovementPattern.Stationary, },);

    // organic preset: perAgentCap = 8. Override world cap to 2 for fast
    // exhaustion (organic also has perUserCap = 24, but the driver scopes
    // to `world:<id>` so it hits perUserCap; we override BOTH for safety).
    await db
      .updateTable("worlds",)
      .set({
        autonomy_config: JSON.stringify({
          perAgentCap: 2,
          perUserCap: 2,
          enabled: true,
        },),
      },)
      .where("id", "=", worldId,)
      .execute();

    const governor = new AutonomyGovernor();
    // Fire 2 ticks under cap.
    for (let i = 0; i < 2; i++) {
      const out = await runNpcMovementTick(db, worldId, {
        chatId,
        rng: RNG_FIRES,
        governor,
      },);
      expect("results" in out,).toBe(true,);
    }
    // Third tick: budget exceeded.
    const denied = await runNpcMovementTick(db, worldId, {
      chatId,
      rng: RNG_FIRES,
      governor,
    },);
    expect("skipped" in denied && denied.skipped,).toBe("budget",);
    if ("skipped" in denied && denied.skipped === "budget") {
      expect(denied.reason.ok,).toBe(false,);
      expect(denied.reason.remaining,).toBe(0,);
    }
  });

  test("cadence: repeated scheduled calls fire repeatedly", async () => {
    const { ownerId, worldId, } = await makeWorld("cadence",);
    const chatId = await makeChat(worldId, ownerId,);
    const locA = await makeLocation(worldId, "a",);
    const locB = await makeLocation(worldId, "b",);
    const actorId = await makeNpc(worldId, locA, {
      movementPattern: MovementPattern.Patrol,
      patrolRoute: [locA, locB,],
      patrolIndex: 0,
    },);

    // Three scheduled ticks. Patrol bounces A→B, B→A, A→B.
    for (let i = 0; i < 3; i++) {
      const out = await runNpcMovementTick(db, worldId, {
        chatId,
        rng: RNG_FIRES,
        governor: new AutonomyGovernor(),
      },);
      expect("results" in out,).toBe(true,);
      if ("results" in out) {
        expect(out.results[0]!.actorId,).toBe(actorId,);
      }
    }
  });

  test("cadence: budget exhaustion persists across scheduled calls", async () => {
    const { ownerId, worldId, } = await makeWorld("cadence-budget",);
    const chatId = await makeChat(worldId, ownerId,);
    const loc = await makeLocation(worldId, "z",);
    await makeNpc(worldId, loc, { movementPattern: MovementPattern.Stationary, },);

    await db
      .updateTable("worlds",)
      .set({
        autonomy_config: JSON.stringify({
          perAgentCap: 1,
          perUserCap: 1,
          enabled: true,
        },),
      },)
      .where("id", "=", worldId,)
      .execute();

    const governor = new AutonomyGovernor();
    const first = await runNpcMovementTick(db, worldId, {
      chatId,
      rng: RNG_FIRES,
      governor,
    },);
    expect("results" in first,).toBe(true,);

    // Subsequent ticks within the same window must remain denied.
    for (let i = 0; i < 3; i++) {
      const out = await runNpcMovementTick(db, worldId, {
        chatId,
        rng: RNG_FIRES,
        governor,
      },);
      expect("skipped" in out && out.skipped,).toBe("budget",);
    }
  });

  test("no NPCs: tick still fires and returns empty results", async () => {
    const { ownerId, worldId, } = await makeWorld("empty",);
    const chatId = await makeChat(worldId, ownerId,);
    const out = await runNpcMovementTick(db, worldId, {
      chatId,
      rng: RNG_FIRES,
    },);
    expect("results" in out,).toBe(true,);
    if ("results" in out) {
      expect(out.results,).toEqual([],);
    }
  });
});
