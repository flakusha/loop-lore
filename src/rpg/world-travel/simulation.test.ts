// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/world-travel/simulation.test.ts — the 100-tick world run
 *
 * `travel.test.ts` pins the walk rule one decision at a time. This file runs
 * the whole tick loop long enough for the properties that only appear at scale
 * to show up: that the run is a function of state alone, that a replay of an
 * entire window costs nothing, and that an exhausted budget stops the world
 * instead of letting it drift past the ceiling.
 *
 * The corridor is three parties on A→B→C, two at one edge per tick and one at
 * half — enough contention to exercise the collision rule, the fractional
 * carry, and the tick-0 latch in the same run.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertLocations,
  insertNpcStates,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { BUDGET_WINDOW_TICKS, } from "./budget";
import { advancePartyTravel, } from "./travel";
import { type TravelContext, travelDb, } from "./types";

let db: Kysely<DB>;

const WORLD_ID = "world-sim";
const LOC_A = "loc-sim-a";
const LOC_B = "loc-sim-b";
const LOC_C = "loc-sim-c";

/** Fixed instant — only ever written to `updated_at`. */
const T0 = 1_800_000_000_000;

/** Where every party stood at a tick that refused a charge. */
interface FrozenFrame {
  /** The tick that reported `budgetExhausted`. */
  tick: number;
  /** Every party's position at that tick, keyed by id. */
  positions: Record<string, string | null>;
}

/** The per-tick trace a simulation run produces. */
interface SimRun {
  /** `tick:partyId` for every action, in order. */
  actions: string[];
  /** Tick indices that reported `budgetExhausted`. */
  exhausted: number[];
  /** Every party's position once the run ends. */
  final: { id: string; route_index: number; current_location_id: string | null }[];
  /**
   * Positions sampled at each refusal.
   *
   * The action log alone CANNOT see the commit-then-charge bug: that code
   * moved the party and then broke before pushing the action, so the movement
   * left no trace in `actions`. Sampling positions is what gives this file
   * a surface on which the bug is observable.
   */
  frozen: FrozenFrame[];
}

/** A context with no shared claim set, so occupancy resets every tick. */
function tickContext(ceiling: number,): TravelContext {
  return { nowMs: T0, rng: () => 0.5, ceiling, };
}

/** One owner, one world, three locations. */
async function makeWorld(): Promise<void> {
  const ownerId = "user-sim-owner";
  await insertUsers(db, "sim-owner", "Owner", { id: ownerId, },);
  await insertWorlds(db, ownerId, "Sim World", { id: WORLD_ID, },);
  await insertLocations(db, WORLD_ID, "A", { id: LOC_A, },);
  await insertLocations(db, WORLD_ID, "B", { id: LOC_B, },);
  await insertLocations(db, WORLD_ID, "C", { id: LOC_C, },);
  await insertActors(db, "Rover", { id: "npc-sim", actor_type: "character", agent_type: "npc", },);
  await insertNpcStates(db, "npc-sim", WORLD_ID, { location_id: LOC_A, },);
}

/** Three parties on the A→B→C corridor: two at full speed, one at half. */
async function seedCorridor(): Promise<void> {
  await makeWorld();
  const route = JSON.stringify([LOC_A, LOC_B, LOC_C,],);
  for (const [id, stepsPerTick,] of [["party-one", 1,], ["party-two", 1,], ["party-slow", 0.5,],] as const) {
    await travelDb(db,)
      .insertInto("travel_parties",)
      .values({
        id,
        world_id: WORLD_ID,
        name: id,
        route,
        route_index: 0,
        steps_per_tick: stepsPerTick,
        travel_progress: 0,
        current_location_id: LOC_A,
        status: "traveling",
        blocked_until_tick: 0,
      },)
      .execute();
  }
}

/** The world's spend ledger, or null when no charge has ever opened it. */
async function readLedger(): Promise<{ spent: number; window_start_tick: number } | null> {
  const row = await travelDb(db,)
    .selectFrom("world_travel_budget",)
    .select(["spent", "window_start_tick",],)
    .where("world_id", "=", WORLD_ID,)
    .executeTakeFirst();
  return row ?? null;
}

/**
 * Fire `ticks` world ticks and return the trace.
 *
 * The dispatch builds a fresh claim set per tick. A shared one would let tick
 * N's arrivals block tick N+1, which the collision rule forbids — occupancy
 * tracks ARRIVALS, not standing.
 * @param ticks how many tick indices to fire, starting at 0
 * @param ceiling per-window budget the world is allowed
 * @returns the action log, the exhaustion ticks, and the final positions
 */
async function runTicks(ticks: number, ceiling: number,): Promise<SimRun> {
  const actions: string[] = [];
  const exhausted: number[] = [];
  const frozen: FrozenFrame[] = [];
  for (let tick = 0; tick < ticks; tick++) {
    const result = await advancePartyTravel(db, WORLD_ID, tick, tickContext(ceiling,),);
    actions.push(...result.actions.map((a,) => `${a.tick}:${a.subjectId}`),);
    if (result.budgetExhausted) {
      exhausted.push(tick,);
      frozen.push({ tick, positions: await readPositions(), },);
    }
  }
  const final = await travelDb(db,)
    .selectFrom("travel_parties",)
    .select(["id", "route_index", "current_location_id",],)
    .where("world_id", "=", WORLD_ID,)
    .orderBy("id", "asc",)
    .execute();
  return { actions, exhausted, final, frozen, };
}

/** Where every party stands, keyed by id. */
async function readPositions(): Promise<Record<string, string | null>> {
  const rows = await travelDb(db,)
    .selectFrom("travel_parties",)
    .select(["id", "current_location_id",],)
    .where("world_id", "=", WORLD_ID,)
    .execute();
  return Object.fromEntries(rows.map((row,) => [row.id, row.current_location_id,]),);
}

/** The tick a `tick:partyId` entry belongs to. */
function tickOf(entry: string,): number {
  return Number(entry.split(":",)[0],);
}

beforeEach(async () => {
  ({ db, } = await createTestDb());
},);

afterEach(async () => {
  await db.destroy();
},);

describe("a 100-tick world run is a function of state alone", () => {
  test("the same world and seed produce the same actions on a second run", async () => {
    await seedCorridor();
    const first = await runTicks(100, 1,);

    // A fresh world from the identical seed must produce an identical log.
    ({ db, } = await createTestDb());
    await seedCorridor();
    const second = await runTicks(100, 1,);

    expect(first.actions.length,).toBeGreaterThan(0,);
    expect(second.actions,).toEqual(first.actions,);
    expect(second.final,).toEqual(first.final,);
  });

  test("the run exercises the contention, the carry, and the tick-0 latch", async () => {
    await seedCorridor();
    const run = await runTicks(100, 1,);

    // A ceiling of 1 funds twenty actions per ten-tick window, so the world
    // does reach its routes before the money runs out — the parties settle.
    expect(run.final.every((p,) => p.current_location_id === LOC_C),).toBe(true,);
    // The half-speed party is in the log, so the fractional carry is in play.
    expect(run.actions.some((a,) => a.endsWith(":party-slow",)),).toBe(true,);
    // The first tick is tick 0, and every party moved on it — the latch
    // defaults to -1 precisely so a new party is not locked out of it.
    expect(run.actions.filter((a,) => tickOf(a,) === 0).length,).toBeGreaterThan(0,);
  });

  test("replaying all 100 ticks against a moved cursor changes nothing", async () => {
    await seedCorridor();
    const first = await runTicks(100, 1,);
    const ledgerAfterFirst = await readLedger();

    // The scheduler replays a crash-recovered window: every tick index fires a
    // second time. The latch must absorb all of it — no extra action, no extra
    // spend, no party moved twice.
    const replay = await runTicks(100, 1,);

    expect(first.actions.length,).toBeGreaterThan(0,);
    expect(replay.actions,).toEqual([],);
    expect(replay.final,).toEqual(first.final,);
    expect(await readLedger(),).toEqual(ledgerAfterFirst,);
  });

  test("an exhausted budget freezes the world for the rest of its window", async () => {
    await seedCorridor();

    // A ceiling of 0.15 funds three actions, so the corridor cannot pay for
    // itself inside one window: the world runs dry well inside the hundred
    // ticks and refills when the window rolls.
    const run = await runTicks(100, 0.15,);

    expect(run.exhausted.length,).toBeGreaterThan(0,);

    // A window restores the ceiling, so "exhausted" is scoped to a window and
    // never to the world. Per window: the tick it first refuses a charge is
    // also the last tick it does work on. (The previous version of this test
    // asserted "later ticks do no work" against the whole run, which a rolling
    // window can never satisfy — see the concern file, concern 4.)
    const windowOf = (tick: number,) => tick - tick % BUDGET_WINDOW_TICKS;
    for (const entry of run.actions) {
      const window = windowOf(tickOf(entry,),);
      const refusals = run.exhausted.filter((t,) => windowOf(t,) === window);
      if (refusals.length === 0) { continue; }
      expect(tickOf(entry,),).toBeLessThanOrEqual(Math.min(...refusals,),);
    }

    // And the load-bearing one: a refused charge moves NOBODY — not even a
    // move the action log never recorded. Under commit-then-charge the first
    // party of every refused tick still committed its step and then broke
    // before pushing the action, so the corridor finished itself for free over
    // ticks 2-9 while `actions` stayed empty. That is why this samples
    // positions rather than trusting the log, and why the old assertion passed
    // against code that was handing out free travel.
    for (let i = 1; i < run.frozen.length; i += 1) {
      const previous = run.frozen[i - 1]!;
      const current = run.frozen[i]!;
      if (windowOf(previous.tick,) !== windowOf(current.tick,)) { continue; }
      expect(current.positions,).toEqual(previous.positions,);
    }

    // Spend stopped at the ceiling instead of drifting past it.
    expect((await readLedger())?.spent,).toBeLessThanOrEqual(0.15,);
  });
});
