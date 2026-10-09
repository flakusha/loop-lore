// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/autonomy/dispatch/dispatch-targets.test.ts — the dispatch targets
 *
 * One file for five targets because every one of them is the same shape:
 * read the tick index, run a subsystem, aggregate into `{dispatched}` or
 * `{skipped}`. Each case below pins one target's own short-circuit
 * vocabulary, plus both `readTickIndex` outcomes (seeded / unseeded) the
 * targets are built on.
 *
 * The tick index is the only shared input, and the two targets that read it
 * disagree on the unseeded default on purpose (`travel` reads it as tick 0,
 * `discovery` refuses to run at all), so both are asserted rather than one
 * standing in for the other.
 *
 * No `mock.module` here: every dependency is either a real subsystem over a
 * migrated in-memory DB or a stub passed through the target's own options
 * seam. That keeps the file safe in a shared process.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { WorkflowDagEngine, } from "../../cron/dag/engine";
import type { TaskRegistry, TaskRunner, } from "../../cron/dag/types";
import type { DB, } from "../../db/schema";
import type { PlanRecomputeFn, } from "../../services/agency/bdi-nightly";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActorDailyPlans,
  insertActors,
  insertChats,
  insertLocations,
  insertNpcStates,
  insertTravelParties,
  insertUsers,
  insertWorldMembers,
  insertWorlds,
  insertWorldSimulationState,
} from "../../test-utils/insert-helpers";
import type { AutonomyConfig, } from "../config";
import { readTickIndex, } from "../scheduler/types";
import type { AutonomyDispatchContext, } from "../scheduler/types";
import { BDI_DISPATCH_NAME, BDI_SKIP, createBdiDispatch, } from "./bdi-dispatch";
import { createDiscoveryTradeDispatch, DISCOVERY_SKIP, } from "./discovery-trade-dispatch";
import { createTravelDispatch, } from "./travel-dispatch";
import { createWorkflowDagDispatch, } from "./workflow-dag-dispatch";

let db: Kysely<DB>;

/** Fixed instant. Only ever written to `updated_at` / `nowMs` fields, so
 *  every expectation below is a literal rather than a clock reading. */
const T0 = 1_800_000_000_000;

const WORLD_ID = "world-dispatch";
const CHAT_ID = "chat-dispatch";
const LOC_A = "loc-dispatch-a";
const LOC_B = "loc-dispatch-b";

/** The resolved config every target reads. Caps are literal so the governor
 *  gates are checkable: `perUserCap: 0` denies every consume, a positive one
 *  allows. `perAgentCap: null` is the unbounded case `peek` reports as
 *  `remaining: null`. */
const CFG: AutonomyConfig = {
  preset: "organic",
  enabled: true,
  tickIntervalMs: 30_000,
  jitterRatio: 0,
  perAgentCap: null,
  perUserCap: 5,
  seed: null,
};

beforeEach(async () => {
  ({ db, } = await createTestDb());
},);

afterEach(async () => {
  await db.destroy();
},);

/** One owner, one world, one chat, two locations. */
async function makeWorld(): Promise<void> {
  const ownerId = "user-dispatch-owner";
  await insertUsers(db, "dispatch-owner", "Owner", { id: ownerId, },);
  await insertWorlds(db, ownerId, "Dispatch World", { id: WORLD_ID, },);
  await insertChats(db, "Dispatch Chat", ownerId, { id: CHAT_ID, world_id: WORLD_ID, },);
  await insertLocations(db, WORLD_ID, "A", { id: LOC_A, },);
  await insertLocations(db, WORLD_ID, "B", { id: LOC_B, },);
}

/** The world's cursor row — what `readTickIndex` reads. Absent = unseeded. */
async function seedCursor(tickCount: number,): Promise<void> {
  await insertWorldSimulationState(db, "2027-01-01 00:00:00", { world_id: WORLD_ID, tick_count: tickCount, },);
}

/** One NPC that belongs to the world — all `dueActors` reads. */
async function addMember(actorId: string,): Promise<void> {
  await insertActors(db, actorId, { id: actorId, actor_type: "character", agent_type: "npc", },);
  await insertWorldMembers(db, WORLD_ID, actorId,);
}

function makeCtx(overrides: Partial<AutonomyDispatchContext> = {},): AutonomyDispatchContext {
  return { db, worldId: WORLD_ID, chatId: CHAT_ID, nowMs: T0, cfg: CFG, rng: () => 0.5, ...overrides, };
}

describe("readTickIndex", () => {
  test("a seeded world returns its tick_count", async () => {
    await makeWorld();
    await seedCursor(7,);

    expect(await readTickIndex(makeCtx(),),).toBe(7,);
  });

  test("an unseeded world returns undefined", async () => {
    await makeWorld();

    expect(await readTickIndex(makeCtx(),),).toBeUndefined();
  });
});

describe("createTravelDispatch", () => {
  test("an empty unseeded world reports no_travel at tick 0", async () => {
    await makeWorld();
    const target = createTravelDispatch();

    expect(target.name,).toBe("travel",);
    expect(await target.run(makeCtx(),),).toEqual({ skipped: "no_travel", },);
  });

  test("a traveling party is advanced and the tick reports the action", async () => {
    await makeWorld();
    await seedCursor(1,);
    await insertTravelParties(db, WORLD_ID, "Caravan", {
      id: "party-dispatch",
      route: JSON.stringify([LOC_A, LOC_B,],),
      route_index: 0,
      steps_per_tick: 1,
      travel_progress: 0,
      current_location_id: LOC_A,
      current_tick: -1,
      status: "traveling",
      blocked_until_tick: 0,
    },);

    const target = createTravelDispatch({ name: "travel-custom", ceiling: 2, },);
    expect(target.name,).toBe("travel-custom",);
    expect(await target.run(makeCtx(),),).toEqual({ dispatched: 1, },);
  });
});

describe("createDiscoveryTradeDispatch", () => {
  test("an unseeded world reports world_unseeded", async () => {
    await makeWorld();
    const target = createDiscoveryTradeDispatch();

    expect(target.name,).toBe("discovery",);
    expect(await target.run(makeCtx(),),).toEqual({ skipped: DISCOVERY_SKIP.Unseeded, },);
  });

  test("a present NPC accrues exploration and the tick reports it", async () => {
    await makeWorld();
    await seedCursor(3,);
    await insertActors(db, "Seeker", { id: "npc-dispatch", actor_type: "character", agent_type: "npc", },);
    await insertNpcStates(db, "npc-dispatch", WORLD_ID, { location_id: LOC_A, },);

    const target = createDiscoveryTradeDispatch({ name: "discovery-custom", },);
    expect(target.name,).toBe("discovery-custom",);
    expect(await target.run(makeCtx(),),).toEqual({ dispatched: 1, },);
  });

  test("a seeded world with nobody present reports no_discovery", async () => {
    await makeWorld();
    await seedCursor(3,);

    expect(await createDiscoveryTradeDispatch().run(makeCtx(),),).toEqual({ skipped: DISCOVERY_SKIP.Idle, },);
  });
});

describe("createWorkflowDagDispatch", () => {
  test("no tasks reports no_tasks and never creates an engine", async () => {
    await makeWorld();
    const handle = createWorkflowDagDispatch();

    expect(handle.dispatch.name,).toBe("workflow_dag",);
    expect(await handle.dispatch.run(makeCtx(),),).toEqual({ skipped: "no_tasks", },);
    expect(() => handle.engine).toThrow(/not created yet/,);
  });

  test("an empty task map skips too", async () => {
    await makeWorld();
    const handle = createWorkflowDagDispatch({ tasks: new Map<string, TaskRunner>(), },);

    expect(await handle.dispatch.run(makeCtx(),),).toEqual({ skipped: "no_tasks", },);
  });

  test("one task runs, the pass reports it, and the engine is readable after", async () => {
    await makeWorld();
    const tasks: TaskRegistry = new Map([["only", async () => {},],],);
    const handle = createWorkflowDagDispatch({ tasks, },);

    expect(await handle.dispatch.run(makeCtx(),),).toEqual({ dispatched: 1, },);
    expect(handle.engine.statusMap().nodes.only?.state,).toBe("done",);
  });

  test("a pre-built engine is readable before the first tick", async () => {
    await makeWorld();
    const engine = new WorkflowDagEngine(db,);
    const handle = createWorkflowDagDispatch({ engine, },);

    expect(handle.engine,).toBe(engine,);
  });
});

describe("createBdiDispatch", () => {
  test("a world with no members reports bdi_no_actors", async () => {
    await makeWorld();
    const target = createBdiDispatch({ db, },);

    expect(target.name,).toBe(BDI_DISPATCH_NAME,);
    // No `today` option: this run derives the plan date from `nowMs`.
    expect(await target.run(makeCtx(),),).toEqual({ skipped: BDI_SKIP.NoActors, },);
  });

  test("a member already planned today reports bdi_off_cadence", async () => {
    await makeWorld();
    await addMember("actor-planned",);
    await insertActorDailyPlans(db, "actor-planned", "2026-01-01", "rest", { world_id: WORLD_ID, },);

    const target = createBdiDispatch({ db, today: "2026-01-01", },);
    expect(await target.run(makeCtx(),),).toEqual({ skipped: BDI_SKIP.OffCadence, },);
  });

  test("an exhausted per-user cap reports bdi_budget", async () => {
    await makeWorld();
    await addMember("actor-broke",);

    const target = createBdiDispatch({ db, today: "2026-01-01", },);
    const ctx = makeCtx({ cfg: { ...CFG, perUserCap: 0, }, },);
    expect(await target.run(ctx,),).toEqual({ skipped: BDI_SKIP.Budget, },);
  });

  test("a due member is reflected on and the tick reports the plan", async () => {
    await makeWorld();
    await addMember("actor-due",);

    const planRecompute: PlanRecomputeFn = async () => ({
      summary: "guard the gate",
      priority: "high",
      activities: [{ description: "patrol", score: 0.5, },],
    });

    const target = createBdiDispatch({ db, planRecompute, today: "2026-01-01", },);
    expect(await target.run(makeCtx(),),).toEqual({ dispatched: 1, },);
  });

  test("a jitter draw below the ratio skips before any governor charge", async () => {
    await makeWorld();
    await addMember("actor-jitter",);

    let recomputed = 0;
    const planRecompute: PlanRecomputeFn = async () => {
      recomputed += 1;
      return { summary: "never", priority: "low", activities: [], };
    };

    const target = createBdiDispatch({ db, planRecompute, today: "2026-01-01", },);
    const ctx = makeCtx({ cfg: { ...CFG, jitterRatio: 0.5, }, rng: () => 0, },);
    expect(await target.run(ctx,),).toEqual({ skipped: BDI_SKIP.Jitter, },);
    expect(recomputed,).toBe(0,);
    // No charge was taken: the full hourly budget is still available.
    const budget = await db.selectFrom("autonomy_budget",).selectAll().execute();
    expect(budget,).toEqual([],);
  });

  test("a jitter draw above the ratio recomputes", async () => {
    await makeWorld();
    await addMember("actor-lucky",);

    const planRecompute: PlanRecomputeFn = async () => ({
      summary: "spread out",
      priority: "high",
      activities: [{ description: "patrol", score: 0.5, },],
    });

    const target = createBdiDispatch({ db, planRecompute, today: "2026-01-01", },);
    const ctx = makeCtx({ cfg: { ...CFG, jitterRatio: 0.5, }, rng: () => 1, },);
    expect(await target.run(ctx,),).toEqual({ dispatched: 1, },);
  });
});
