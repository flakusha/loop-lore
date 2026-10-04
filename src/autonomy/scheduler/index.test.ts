// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * AutonomyScheduler unit + integration tests.
 *
 * Covers:
 *   - tick loop: only due, un-paused worlds dispatch
 *   - due-actor selection determinism: (next_tick_at ASC, world_id
 *     ASC) survives a fresh scheduler instance (= a restart)
 *   - dispatch integration: the real runNpcMovementTick moves an NPC
 *     and the cursor advances by the resolved cadence
 *   - pause / resume / step, including step-while-paused
 *   - restart persistence: cursor, pause flag, tick count
 *   - error isolation: a throwing world is recorded + backed off while
 *     healthy worlds keep ticking
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { MovementPattern, } from "../../rpg/npc-navigation/service/types";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertLocations,
  insertLocationStates,
  insertNpcStates,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { toDate, } from "../../utils/date";
import { AutonomyScheduler, } from "./index";

let db: Kysely<DB>;

/** RNG that never loses the jitter coin flip (1.0 > any ratio). */
const RNG_FIRES = (): number => 1;

/** Fixed instant so cursor arithmetic is exact. */
const T0 = 1_800_000_000_000;

beforeEach(async () => {
  ({ db, } = await createTestDb());
},);

afterEach(async () => {
  await db.destroy();
},);

async function makeWorld(name: string,) {
  const ownerId = uid();
  const worldId = uid();
  await insertUsers(db, "owner-" + ownerId, "Owner " + name, { id: ownerId, },);
  await insertWorlds(db, ownerId, name, { id: worldId, },);
  const chatId = uid();
  await insertChats(db, "chat-" + chatId, ownerId, { id: chatId, world_id: worldId, },);
  return { worldId, chatId, };
}

/** World with one patrolling NPC oscillating between two locations. */
async function makePatrolWorld(name: string,) {
  const { worldId, chatId, } = await makeWorld(name,);
  const locA = uid();
  const locB = uid();
  await insertLocations(db, worldId, "a", { id: locA, },);
  await insertLocations(db, worldId, "b", { id: locB, },);
  await insertLocationStates(db, locA, worldId,);
  await insertLocationStates(db, locB, worldId,);
  const actorId = uid();
  await insertActors(db, "NPC " + actorId, { id: actorId, actor_type: "character", },);
  await insertNpcStates(db, actorId, worldId, {
    location_id: locA,
    schedule: JSON.stringify({
      movementPattern: MovementPattern.Patrol,
      patrolRoute: [locA, locB,],
      patrolIndex: 0,
    },),
  },);

  return { worldId, chatId, actorId, locA, locB, };
}

/** Force a world's cursor. `paused` 1 keeps it out of the due set. */
async function setDue(worldId: string, nextTickAtMs: number, paused = 0,): Promise<void> {
  const row = {
    next_tick_at: toDate(nextTickAtMs,).toISOString(),
    paused,
  };

  await db
    .insertInto("world_simulation_state",)
    .values({ world_id: worldId, ...row, last_run_at: null, last_error: null, tick_count: 0, },)
    .onConflict((oc,) => oc.column("world_id",).doUpdateSet(row,))
    .execute();
}

describe("AutonomyScheduler.tickOnce — due selection", () => {
  test("dispatches only worlds whose cursor is due", async () => {
    const due = await makePatrolWorld("due",);
    const later = await makePatrolWorld("later",);
    const sched = new AutonomyScheduler(db, { rng: RNG_FIRES, },);
    await setDue(due.worldId, T0 - 10_000,);
    await setDue(later.worldId, T0 + 10_000,);

    const result = await sched.tickOnce(T0,);
    expect(result.dueWorldIds,).toEqual([due.worldId,],);
    expect(result.errors,).toBe(0,);
  });

  test("paused worlds are excluded from the due set", async () => {
    const pausedWorld = await makePatrolWorld("held",);
    const running = await makePatrolWorld("flowing",);
    const sched = new AutonomyScheduler(db, { rng: RNG_FIRES, },);
    await setDue(pausedWorld.worldId, T0 - 10_000, 1,);
    await setDue(running.worldId, T0 - 10_000, 0,);

    expect((await sched.tickOnce(T0,)).dueWorldIds,).toEqual([running.worldId,],);
  });

  test("a world with no state row is due without a seed row", async () => {
    // The due set used to be selected from world_simulation_state alone, so
    // a world that had never ticked had no row, was never selected, and no
    // tick ever created the row — the loop was dead for every new world
    // until an admin paused or stepped it. `stepOnce` bypasses the due set,
    // so the old version of this test passed while the loop itself did
    // nothing; this one goes through tickOnce.
    const world = await makePatrolWorld("unseeded",);
    const sched = new AutonomyScheduler(db, { rng: RNG_FIRES, },);

    const before = await sched.stateFor(world.worldId,);
    expect(before.tick_count,).toBe(0,);
    expect(before.paused,).toBe(0,);

    const result = await sched.tickOnce(T0,);
    expect(result.dueWorldIds,).toEqual([world.worldId,],);
    expect(result.errors,).toBe(0,);

    const after = await sched.stateFor(world.worldId,);
    expect(after.tick_count,).toBe(1,);
    // A cursor row now exists, so the next pass is driven by that row
    // rather than by the seedless-world branch.
    expect(Date.parse(after.next_tick_at,),).toBeGreaterThan(T0,);
    expect((await sched.tickOnce(T0,)).dueWorldIds,).toEqual([],);
  });

  test("stepOnce still works on a world with no state row", async () => {
    const world = await makePatrolWorld("step-unseeded",);
    const sched = new AutonomyScheduler(db, { rng: RNG_FIRES, },);

    const step = await sched.stepOnce(world.worldId, T0,);
    expect(step.outcome,).toEqual({ dispatched: 1, },);
    expect((await sched.stateFor(world.worldId,)).tick_count,).toBe(1,);
  });
});

describe("AutonomyScheduler — due ordering determinism", () => {
  test("earliest cursor first; equal cursors broken by world_id; stable across restarts", async () => {
    const tieA = await makePatrolWorld("tie-a",);
    const tieB = await makePatrolWorld("tie-b",);
    const earliest = await makePatrolWorld("earliest",);
    const dueAt = T0 - 1_000;
    // Ids are random, so assert the documented rule rather than a
    // hand-picked literal: earliest first, then the tied ids in
    // ascending lexicographic order.
    const seed = async () => {
      await setDue(earliest.worldId, dueAt - 5_000,);
      await setDue(tieA.worldId, dueAt,);
      await setDue(tieB.worldId, dueAt,);
    };

    const expected = [earliest.worldId, ...[tieA.worldId, tieB.worldId,].sort(),];

    await seed();
    const run1 = await new AutonomyScheduler(db, { rng: RNG_FIRES, },).tickOnce(T0,);
    expect(run1.dueWorldIds,).toEqual(expected,);

    // "Restart": brand-new scheduler, re-seeded cursors, no carryover.
    await seed();
    const run2 = await new AutonomyScheduler(db, { rng: RNG_FIRES, },).tickOnce(T0,);
    expect(run2.dueWorldIds,).toEqual(run1.dueWorldIds,);
    expect(run2.worlds.map((w,) => w.worldId),).toEqual(expected,);
  });
});

describe("AutonomyScheduler — dispatch integration", () => {
  test("moves an NPC through the existing pipeline and advances the cursor", async () => {
    const world = await makePatrolWorld("dispatch",);
    const sched = new AutonomyScheduler(db, { rng: RNG_FIRES, },);
    await setDue(world.worldId, T0 - 1_000,);

    const result = await sched.tickOnce(T0,);
    expect(result.worlds[0]!.outcome,).toEqual({ dispatched: 1, },);

    // The patrol really moved: location A → B, index 0 → 1.
    const npc = await db
      .selectFrom("npc_states",)
      .select(["location_id", "schedule",],)
      .where("actor_id", "=", world.actorId,)
      .executeTakeFirst();

    expect(npc?.location_id,).toBe(world.locB,);
    expect(JSON.parse(npc?.schedule ?? "{}",).patrolIndex,).toBe(1,);

    const state = await sched.stateFor(world.worldId,);
    expect(state.tick_count,).toBe(1,);
    expect(state.last_error,).toBeNull();
    expect(state.last_run_at,).toBe(toDate(T0,).toISOString(),);
    expect(Date.parse(state.next_tick_at,),).toBeGreaterThan(T0,);
    // Not due again at the same instant.
    expect((await sched.tickOnce(T0,)).dueWorldIds,).toEqual([],);
  });

  test("budget-denied world is rescheduled rather than dropped or re-selected", async () => {
    const world = await makePatrolWorld("budget",);
    await db
      .updateTable("worlds",)
      .set({ autonomy_config: JSON.stringify({ perAgentCap: 0, perUserCap: 0, enabled: true, },), },)
      .where("id", "=", world.worldId,)
      .execute();

    const sched = new AutonomyScheduler(db, { rng: RNG_FIRES, },);
    await setDue(world.worldId, T0 - 1_000,);

    expect((await sched.tickOnce(T0,)).worlds[0]!.outcome,).toEqual({ skipped: "budget", },);

    const state = await sched.stateFor(world.worldId,);
    expect(state.tick_count,).toBe(1,);
    expect(Date.parse(state.next_tick_at,),).toBeGreaterThan(T0,);
    expect((await sched.tickOnce(T0,)).dueWorldIds,).toEqual([],);
  });

  test("disabled autonomy is skipped and still rescheduled", async () => {
    const world = await makePatrolWorld("off",);
    await db
      .updateTable("worlds",)
      .set({ autonomy_config: JSON.stringify({ enabled: false, },), },)
      .where("id", "=", world.worldId,)
      .execute();

    const sched = new AutonomyScheduler(db, { rng: RNG_FIRES, },);
    await setDue(world.worldId, T0 - 1_000,);

    expect((await sched.tickOnce(T0,)).worlds[0]!.outcome,).toEqual({ skipped: "disabled", },);
    expect((await sched.stateFor(world.worldId,)).tick_count,).toBe(1,);
  });
});

describe("AutonomyScheduler — pause / resume / step", () => {
  test("pause drops the world from the loop; resume returns it at the same cursor", async () => {
    const world = await makePatrolWorld("pr",);
    const sched = new AutonomyScheduler(db, { rng: RNG_FIRES, },);
    await setDue(world.worldId, T0 - 1_000,);

    const paused = await sched.pause(world.worldId,);
    expect(paused.paused,).toBe(1,);
    expect((await sched.tickOnce(T0,)).dueWorldIds,).toEqual([],);

    const resumed = await sched.resume(world.worldId,);
    expect(resumed.paused,).toBe(0,);
    expect(resumed.next_tick_at,).toBe(paused.next_tick_at,);
    expect((await sched.tickOnce(T0,)).dueWorldIds,).toEqual([world.worldId,],);
  });

  test("stepOnce dispatches a paused world and leaves it paused", async () => {
    const world = await makePatrolWorld("step",);
    const sched = new AutonomyScheduler(db, { rng: RNG_FIRES, },);
    await setDue(world.worldId, T0 + 60_000,);
    await sched.pause(world.worldId,);

    const step = await sched.stepOnce(world.worldId, T0,);
    expect(step.outcome,).toEqual({ dispatched: 1, },);

    const state = await sched.stateFor(world.worldId,);
    expect(state.paused,).toBe(1,);
    expect(state.tick_count,).toBe(1,);
    expect((await sched.tickOnce(T0 + 1_000,)).dueWorldIds,).toEqual([],);
  });
});

describe("AutonomyScheduler — restart persistence", () => {
  test("a fresh scheduler resumes the same cursor and fires exactly at it", async () => {
    const world = await makePatrolWorld("restart",);
    await setDue(world.worldId, T0 - 1_000,);
    await new AutonomyScheduler(db, { rng: RNG_FIRES, },).tickOnce(T0,);
    const cursor = (await new AutonomyScheduler(db,).stateFor(world.worldId,)).next_tick_at;

    // "Restart": brand-new instance reading the same DB.
    const after = new AutonomyScheduler(db, { rng: RNG_FIRES, },);
    const state = await after.stateFor(world.worldId,);
    expect(state.next_tick_at,).toBe(cursor,);
    expect(state.tick_count,).toBe(1,);
    expect(state.last_run_at,).toBe(toDate(T0,).toISOString(),);

    expect((await after.tickOnce(T0,)).dueWorldIds,).toEqual([],);
    expect((await after.tickOnce(Date.parse(cursor,) + 1,)).dueWorldIds,).toEqual([world.worldId,],);
  });

  test("pause survives a restart", async () => {
    const world = await makePatrolWorld("restart-paused",);
    await setDue(world.worldId, T0 - 1_000,);
    await new AutonomyScheduler(db, { rng: RNG_FIRES, },).pause(world.worldId,);

    const after = new AutonomyScheduler(db, { rng: RNG_FIRES, },);
    expect((await after.stateFor(world.worldId,)).paused,).toBe(1,);
    expect((await after.tickOnce(T0,)).dueWorldIds,).toEqual([],);
  });
});

describe("AutonomyScheduler — telemetry", () => {
  test("a world tick emits started + completed with the world/payload envelope", async () => {
    const world = await makePatrolWorld("telemetry",);
    const sched = new AutonomyScheduler(db, { rng: RNG_FIRES, },);
    await setDue(world.worldId, T0 - 1_000,);
    await sched.tickOnce(T0,);
    // Fire-and-forget writes: give the microtask queue a turn.
    await new Promise((r,) => setTimeout(r, 50,));

    const rows = await db
      .selectFrom("telemetry_events",)
      .selectAll()
      .where("event_type", "in", ["scheduler.world_tick.started", "scheduler.world_tick.completed",],)
      .execute();

    expect(rows.length,).toBeGreaterThanOrEqual(2,);

    const started = rows.find((r,) => r.event_type === "scheduler.world_tick.started")!;
    const startedData = JSON.parse(started.event_data,);
    expect(startedData.world_id,).toBe(world.worldId,);
    expect(startedData.tick_count,).toBe(0,);

    const completed = rows.find((r,) => r.event_type === "scheduler.world_tick.completed")!;
    const completedData = JSON.parse(completed.event_data,);
    expect(completedData.world_id,).toBe(world.worldId,);
    expect(completedData.outcome,).toBe("dispatched:1",);
    expect(completedData.tick_count,).toBe(1,);
    expect(completedData.next_tick_at,).toBeTruthy();
  });
});

describe("AutonomyScheduler — error isolation", () => {
  test("a throwing world records the error and backs off; healthy worlds keep ticking", async () => {
    // Sabotage: a patrol route pointing at a location that does not
    // exist makes the movement write fail its FK constraint, so the
    // dispatch throws the way a corrupt world would in production.
    const broken = await makePatrolWorld("broken",);
    const healthy = await makePatrolWorld("healthy",);
    await db
      .updateTable("npc_states",)
      .set({
        schedule: JSON.stringify({
          movementPattern: MovementPattern.Patrol,
          patrolRoute: [broken.locA, uid(),],
          patrolIndex: 0,
        },),
      },)
      .where("actor_id", "=", broken.actorId,)
      .execute();

    await setDue(broken.worldId, T0 - 2_000,);
    await setDue(healthy.worldId, T0 - 1_000,);

    const sched = new AutonomyScheduler(db, { rng: RNG_FIRES, },);
    const result = await sched.tickOnce(T0,);

    expect(result.errors,).toBe(1,);
    // Order is by cursor first: broken is due 1s before healthy.
    expect(result.dueWorldIds,).toEqual([broken.worldId, healthy.worldId,],);
    const brokenResult = result.worlds.find((w,) => w.worldId === broken.worldId)!;
    expect(brokenResult.outcome,).toEqual({ skipped: "error", },);
    expect(brokenResult.error,).toBeTruthy();

    const brokenState = await sched.stateFor(broken.worldId,);
    expect(brokenState.last_error,).toBe(brokenResult.error!.slice(0, 500,),);
    expect(brokenState.tick_count,).toBe(0,); // a failed tick is not counted
    expect(Date.parse(brokenState.next_tick_at,),).toBeGreaterThan(T0,);

    const healthyState = await sched.stateFor(healthy.worldId,);
    expect(healthyState.tick_count,).toBe(1,);
    expect(healthyState.last_error,).toBeNull();
  });
});
