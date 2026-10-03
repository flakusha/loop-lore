// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/world-travel/travel.test.ts — `advancePartyTravel` and `migrateNpc`
 *
 * Route walking, the arrival-collision rule, the corrupt-route skip, the
 * budget ceiling, and the two NPC migration transitions. None of it draws an
 * RNG: the step is a function of (stored cursor, tick index, budget), so
 * every expectation below is a literal.
 *
 * Continuous-hop span
 * -------------------
 * A continuous migration's hop span is anchored to the row's own SCHEDULED
 * length (`arrive - depart`), not to `last_depart_tick` — anchoring to the
 * latter shrank every leg by one (10, 10, 9, 8, 7) and degenerated a
 * continuous migration into a jitter. Pinned in the continuous-hop case, which
 * asserts a full third leg at the same ten-tick span.
 *
 * The replay latch (`current_tick < tick` on the party write) is asserted the
 * right way round at the bottom of this file.
 *
 * Charge ordering: `advancePartyTravel` charges BEFORE it writes the party's
 * row, matching `migrateNpc` and `chargeBudget`'s own contract that a refused
 * charge means "no action happened". The budget cases pin that a party refused
 * for money does not move — an exhausted ledger must still bound the world.
 *
 * A replayed tick is dropped before the charge (the `current_tick` latch), so
 * the same tick twice bills once.
 *
 * Concurrency: `chargeBudget`'s UPDATE is a compare-and-set on the two columns
 * it read, so two runners charging one world from one pre-state cannot both be
 * accepted — the loser's UPDATE matches no row and it returns false. That is a
 * spurious refusal, never a lost charge: the caller already treats false as
 * "no action happened". This is complementary to the `current_tick` latch
 * above, not overlapping — the latch stops a replayed tick billing twice, the
 * CAS stops two concurrent ticks from under-counting the ledger.
 *
 * Replay harness trap: `world_travel_budget` is a per-world ledger whose
 * window rolls by tick count, and a refused charge sets `budgetExhausted`
 * and breaks the loop before the movement under test is even attempted. The
 * exhaustion cases therefore seed their own window rather than relying on
 * whatever a previous tick left behind.
 *
 * Collision rule, restated because it drives most of the cases: a location
 * holds ONE arrival per tick. First claimant in tick order wins; losers defer
 * to `blocked_until_tick = tick + 1` and re-contest. Occupancy tracks
 * ARRIVALS only, so a party already resting somewhere never blocks a
 * newcomer. The claim set is per TICK — the dispatch builds a fresh one each
 * tick — so nothing carries over between calls at different tick indices.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertLocations,
  insertNpcMigrations,
  insertNpcStates,
  insertUsers,
  insertWorlds,
  insertWorldTravelBudget,
} from "../../test-utils/insert-helpers";
import { ACTION_COST, chargeBudget, } from "./budget";
import { migrateNpc, } from "./migration";
import { advancePartyTravel, } from "./travel";
import { type TravelContext, travelDb, } from "./types";

let db: Kysely<DB>;

/** Fixed instant — only ever written to `updated_at`. */
const T0 = 1_800_000_000_000;

/** Literal ids so cursor expectations are checkable line by line. */
const WORLD_ID = "world-travel";
const OTHER_WORLD_ID = "world-travel-other";
const LOC_A = "loc-trv-a";
const LOC_B = "loc-trv-b";
const LOC_C = "loc-trv-c";
const PARTY_ONE = "party-one";
const PARTY_TWO = "party-two";
const NPC_ID = "npc-trv";

beforeEach(async () => {
  ({ db, } = await createTestDb());
},);

afterEach(async () => {
  await db.destroy();
},);

/** One owner, two worlds, three locations, one NPC. */
async function makeWorld(): Promise<void> {
  const ownerId = "user-trv-owner";
  await insertUsers(db, "trv-owner", "Owner", { id: ownerId, },);
  await insertWorlds(db, ownerId, "Travel World", { id: WORLD_ID, },);
  await insertWorlds(db, ownerId, "Travel Other", { id: OTHER_WORLD_ID, },);
  await insertLocations(db, WORLD_ID, "A", { id: LOC_A, },);
  await insertLocations(db, WORLD_ID, "B", { id: LOC_B, },);
  await insertLocations(db, WORLD_ID, "C", { id: LOC_C, },);
  await insertActors(db, "Rover", { id: NPC_ID, actor_type: "character", agent_type: "npc", },);
  await insertNpcStates(db, NPC_ID, WORLD_ID, { location_id: LOC_A, },);
}

/** A party on the A→B→C route. Literal ids double as the ORDER BY tie-break,
 *  so `party-one` is always walked before `party-two`. */
async function seedParty(
  id: string,
  opts: {
    route?: string;
    routeIndex?: number;
    stepsPerTick?: number;
    travelProgress?: number;
    status?: string;
    blockedUntilTick?: number;
    worldId?: string;
  } = {},
): Promise<void> {
  await travelDb(db,)
    .insertInto("travel_parties",)
    .values({
      id,
      world_id: opts.worldId ?? WORLD_ID,
      name: `Party ${id}`,
      route: opts.route ?? JSON.stringify([LOC_A, LOC_B, LOC_C,],),
      route_index: opts.routeIndex ?? 0,
      steps_per_tick: opts.stepsPerTick ?? 1,
      travel_progress: opts.travelProgress ?? 0,
      current_location_id: opts.routeIndex === undefined ? LOC_A : null,
      status: opts.status ?? "traveling",
      blocked_until_tick: opts.blockedUntilTick ?? 0,
    },)
    .execute();
}

/** The persisted party row. */
async function readParty(id: string,) {
  const row = await travelDb(db,)
    .selectFrom("travel_parties",)
    .selectAll()
    .where("id", "=", id,)
    .executeTakeFirst();
  if (!row) { throw new Error(`no travel_parties row for ${id}`,); }
  return row;
}

/** The persisted migration row. */
async function readMigration(id: string,) {
  const row = await travelDb(db,)
    .selectFrom("npc_migrations",)
    .selectAll()
    .where("id", "=", id,)
    .executeTakeFirst();
  if (!row) { throw new Error(`no npc_migrations row for ${id}`,); }
  return row;
}

/** Where the NPC currently stands. */
async function readNpcLocation(): Promise<string | null> {
  const row = await db
    .selectFrom("npc_states",)
    .select("location_id",)
    .where("actor_id", "=", NPC_ID,)
    .where("world_id", "=", WORLD_ID,)
    .executeTakeFirstOrThrow();
  return row.location_id;
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

/** A context with a shared claim set. The dispatch hands both subsystems one
 *  set per tick, so the collision cases pass the SAME set to both calls. */
function travelContext(claims?: Set<string>, ceiling = 1,): TravelContext {
  return { nowMs: T0, rng: () => 0.5, ceiling, ...(claims === undefined ? {} : { claims, }), };
}

describe("advancePartyTravel — walking a route", () => {
  test("a 2-stop route at one step per tick advances one edge per tick and rests at the end", async () => {
    await makeWorld();
    await seedParty(PARTY_ONE,);
    const ctx = travelContext();

    expect((await advancePartyTravel(db, WORLD_ID, 1, ctx,)).actions,).toEqual([
      { kind: "party_step", subjectId: PARTY_ONE, tick: 1, cost: ACTION_COST, },
    ],);
    let party = await readParty(PARTY_ONE,);
    expect(party.route_index,).toBe(1,);
    expect(party.current_location_id,).toBe(LOC_B,);
    // Mid-route: still moving.
    expect(party.status,).toBe("traveling",);
    expect(party.travel_progress,).toBe(0,);
    expect(party.current_tick,).toBe(1,);

    expect((await advancePartyTravel(db, WORLD_ID, 2, ctx,)).actions,).toHaveLength(1,);
    party = await readParty(PARTY_ONE,);
    expect(party.route_index,).toBe(2,);
    expect(party.current_location_id,).toBe(LOC_C,);
    // End of route: arrived and settled.
    expect(party.status,).toBe("resting",);

    // A resting party at the route end has nothing left to walk.
    expect(await advancePartyTravel(db, WORLD_ID, 3, ctx,),).toEqual({
      actions: [],
      deferred: 0,
      budgetExhausted: false,
    },);
    expect((await readParty(PARTY_ONE,)).route_index,).toBe(2,);
  });

  test("a speed above 1 walks several edges in one tick", async () => {
    await makeWorld();
    // Two edges of speed, two edges of route left: both are consumed this
    // tick and the party ends the tick settled at the last stop.
    await seedParty(PARTY_ONE, { stepsPerTick: 2, },);

    await advancePartyTravel(db, WORLD_ID, 1, travelContext(),);
    const party = await readParty(PARTY_ONE,);
    expect(party.route_index,).toBe(2,);
    expect(party.current_location_id,).toBe(LOC_C,);
    expect(party.status,).toBe("resting",);
    // No surplus carry is banked at a closed route: there is nowhere left to
    // spend it, so a settled party's progress is 0 rather than the leftover.
    expect(party.travel_progress,).toBe(0,);
    expect((await advancePartyTravel(db, WORLD_ID, 2, travelContext(),)).actions,).toEqual([],);
    expect((await readParty(PARTY_ONE,)).route_index,).toBe(2,);
  });

  test("a speed of 0.5 moves on the second tick only, and carries its fraction", async () => {
    await makeWorld();
    await seedParty(PARTY_ONE, { stepsPerTick: 0.5, },);
    const ctx = travelContext();

    // Half an edge: real distance covered, so it is persisted — a speed of
    // 0.5 that never accumulated would never move at all.
    expect((await advancePartyTravel(db, WORLD_ID, 1, ctx,)).actions,).toHaveLength(1,);
    let party = await readParty(PARTY_ONE,);
    expect(party.route_index,).toBe(0,);
    expect(party.current_location_id,).toBe(LOC_A,);
    expect(party.travel_progress,).toBe(0.5,);
    expect(party.status,).toBe("traveling",);

    // The second half completes the first edge.
    expect((await advancePartyTravel(db, WORLD_ID, 2, ctx,)).actions,).toHaveLength(1,);
    party = await readParty(PARTY_ONE,);
    expect(party.route_index,).toBe(1,);
    expect(party.current_location_id,).toBe(LOC_B,);
    expect(party.travel_progress,).toBe(0,);
  });

  test("a zero or negative speed never moves and never charges", async () => {
    await makeWorld();
    await seedParty(PARTY_ONE, { stepsPerTick: 0, },);
    await seedParty(PARTY_TWO, { stepsPerTick: -1, },);

    expect(await advancePartyTravel(db, WORLD_ID, 1, travelContext(),),).toEqual({
      actions: [],
      deferred: 0,
      budgetExhausted: false,
    },);
    expect((await readParty(PARTY_ONE,)).route_index,).toBe(0,);
    expect((await readParty(PARTY_TWO,)).route_index,).toBe(0,);
    // Neither party was charged: no ledger row was opened at all.
    const ledger = await travelDb(db,)
      .selectFrom("world_travel_budget",)
      .selectAll()
      .where("world_id", "=", WORLD_ID,)
      .executeTakeFirst();
    expect(ledger,).toBeUndefined();
  });

  test("a party blocked until a later tick is not even considered before it", async () => {
    await makeWorld();
    await seedParty(PARTY_ONE, { blockedUntilTick: 5, },);
    const ctx = travelContext();

    expect((await advancePartyTravel(db, WORLD_ID, 4, ctx,)).actions,).toEqual([],);
    expect((await readParty(PARTY_ONE,)).route_index,).toBe(0,);

    expect((await advancePartyTravel(db, WORLD_ID, 5, ctx,)).actions,).toHaveLength(1,);
    expect((await readParty(PARTY_ONE,)).route_index,).toBe(1,);
  });

  test("another world's parties are not walked", async () => {
    await makeWorld();
    await seedParty(PARTY_ONE, { worldId: OTHER_WORLD_ID, },);

    expect((await advancePartyTravel(db, WORLD_ID, 1, travelContext(),)).actions,).toEqual([],);
    expect((await readParty(PARTY_ONE,)).route_index,).toBe(0,);
  });
});

describe("advancePartyTravel — the arrival collision rule", () => {
  test("two parties contesting one destination: the first wins, the second defers a tick", async () => {
    await makeWorld();
    // Same index of the same route, so both target LOC_B this tick.
    await seedParty(PARTY_ONE,);
    await seedParty(PARTY_TWO,);
    const ctx = travelContext();

    const result = await advancePartyTravel(db, WORLD_ID, 1, ctx,);
    expect(result.deferred,).toBe(1,);
    expect(result.actions.map((a,) => a.subjectId),).toEqual([PARTY_ONE,],);

    const winner = await readParty(PARTY_ONE,);
    expect(winner.route_index,).toBe(1,);
    expect(winner.current_location_id,).toBe(LOC_B,);
    expect(winner.blocked_until_tick,).toBe(0,);

    // The loser holds the edge it actually reached — it never double-
    // occupies LOC_B — and re-contests one tick later.
    const loser = await readParty(PARTY_TWO,);
    expect(loser.route_index,).toBe(0,);
    expect(loser.current_location_id,).toBe(LOC_A,);
    expect(loser.blocked_until_tick,).toBe(2,);
    expect(loser.current_tick,).toBe(1,);
    // Tick 2: the loser re-contests and gets the edge it missed.
    expect((await advancePartyTravel(db, WORLD_ID, 2, ctx,)).actions.map((a,) => a.subjectId),)
      .toEqual([PARTY_ONE, PARTY_TWO,],);
    expect((await readParty(PARTY_TWO,)).route_index,).toBe(1,);
    expect((await readParty(PARTY_TWO,)).current_location_id,).toBe(LOC_B,);
    expect((await readParty(PARTY_TWO,)).status,).toBe("traveling",);
    // It fell behind rather than stalling. `blocked_until_tick` keeps the tick
    // it was deferred to rather than being cleared, which is harmless: the
    // filter is `<= currentTick`, so every later tick clears it.
    expect((await readParty(PARTY_TWO,)).blocked_until_tick,).toBe(2,);

    // Tick 3 it walks the last edge with nothing contending for LOC_C.
    expect((await advancePartyTravel(db, WORLD_ID, 3, ctx,)).actions.map((a,) => a.subjectId),)
      .toEqual([PARTY_TWO,],);
    expect((await readParty(PARTY_TWO,)).route_index,).toBe(2,);
    expect((await readParty(PARTY_TWO,)).status,).toBe("resting",);
  });

  test("a party parked at a location does not block a newcomer", async () => {
    await makeWorld();
    // Already resting on the route's second stop: it ARRIVED on an earlier
    // tick, so it holds no arrival claim for this one.
    await seedParty(PARTY_ONE, { routeIndex: 1, status: "resting", route: JSON.stringify([LOC_A, LOC_B,],), },);
    await seedParty(PARTY_TWO, { route: JSON.stringify([LOC_A, LOC_B,],), },);
    const ctx = travelContext();

    const result = await advancePartyTravel(db, WORLD_ID, 1, ctx,);
    expect(result.deferred,).toBe(0,);
    expect(result.actions.map((a,) => a.subjectId),).toEqual([PARTY_TWO,],);
    expect((await readParty(PARTY_TWO,)).current_location_id,).toBe(LOC_B,);
  });

  test("a destination claimed before the tick blocks every party this tick", async () => {
    await makeWorld();
    await seedParty(PARTY_ONE,);

    // The dispatch hands both subsystems one claim set per tick. An arrival
    // already applied elsewhere in the tick owns LOC_B, so the party defers.
    const claims = new Set([LOC_B,],);
    const result = await advancePartyTravel(db, WORLD_ID, 1, travelContext(claims,),);

    expect(result,).toEqual({ actions: [], deferred: 1, budgetExhausted: false, },);
    expect((await readParty(PARTY_ONE,)).route_index,).toBe(0,);
    // The claim came in from outside, so the party must not hand it back.
    expect(claims,).toEqual(new Set([LOC_B,],),);
  });

  test("a party that defers leaves no phantom claim behind for the next party", async () => {
    await makeWorld();
    // ORDER BY id puts "party-one" first ('o' < 't'). It routes A→B→C with
    // LOC_C already claimed, so it walks as far as it can — to LOC_B — and
    // stops there with an edge in hand.
    await seedParty(PARTY_ONE, { route: JSON.stringify([LOC_A, LOC_B, LOC_C,],), },);
    // "party-three" wants only the taken LOC_C, so it defers outright.
    await seedParty("party-three", { route: JSON.stringify([LOC_A, LOC_C,],), },);
    const claims = new Set([LOC_C,],);

    const result = await advancePartyTravel(db, WORLD_ID, 1, travelContext(claims,),);
    expect(result.deferred,).toBe(1,);
    // ONE is the one that MOVED, so it is the one that gets an action. THREE
    // defers and reports nothing.
    expect(result.actions.map((a,) => a.subjectId),).toEqual([PARTY_ONE,],);
    // The shared set holds the outside claim plus ONE's real arrival at LOC_B.
    // THREE speculatively aimed at LOC_C and contributed nothing beyond the
    // claim it was given — a phantom claim there would refuse a later party
    // that never got there.
    expect(claims,).toEqual(new Set([LOC_C, LOC_B,],),);
    expect((await readParty(PARTY_ONE,)).current_location_id,).toBe(LOC_B,);
    expect((await readParty("party-three",)).current_location_id,).toBe(LOC_A,);
    expect((await readParty("party-three",)).blocked_until_tick,).toBe(2,);
  });
});

describe("advancePartyTravel — routes that cannot be walked", () => {
  test("a route naming a DELETED location parks the party instead of raising a foreign-key error", async () => {
    await makeWorld();
    await seedParty(PARTY_ONE, {
      route: JSON.stringify([LOC_A, "loc-trv-gone", LOC_C,],),
    },);

    // `route` is free text with no FK, so it outlives the locations it names.
    // Without the park, the write below would raise out of the tick AFTER
    // the charge landed — billing for a move that never happened and
    // failing every other party's tick along with it.
    const result = await advancePartyTravel(db, WORLD_ID, 1, travelContext(),);
    expect(result.actions,).toEqual([],);
    expect(result.budgetExhausted,).toBe(false,);

    const party = await readParty(PARTY_ONE,);
    expect(party.status,).toBe("resting",);
    expect(party.route_index,).toBe(0,);
    expect(party.current_location_id,).toBe(LOC_A,);

    // Nothing was charged for a move that never happened.
    const ledger = await travelDb(db,)
      .selectFrom("world_travel_budget",)
      .select("spent",)
      .where("world_id", "=", WORLD_ID,)
      .executeTakeFirst();
    expect(ledger,).toBeUndefined();
  });

  test("a parked party is left alone by later ticks instead of re-parking forever", async () => {
    await makeWorld();
    await seedParty(PARTY_ONE, {
      route: JSON.stringify([LOC_A, "loc-trv-gone", LOC_C,],),
    },);

    // The park is terminal: the route names a location the world no longer
    // has, and that never becomes true again. Every later tick must therefore
    // skip the row entirely rather than re-running the same failing check and
    // re-stamping it — which is what happened when the parked status was
    // absent from the `not in` filter, and grew one write per tick forever.
    await advancePartyTravel(db, WORLD_ID, 1, travelContext(),);
    const parked = await readParty(PARTY_ONE,);
    expect(parked.status,).toBe("resting",);

    for (const tick of [2, 3, 4, 5,]) {
      expect((await advancePartyTravel(db, WORLD_ID, tick, travelContext(),)).actions,).toEqual([],);
    }

    // The row is byte-identical to the tick that parked it: not re-parked, and
    // the latch did not drift forward on any of those ticks.
    expect(await readParty(PARTY_ONE,),).toEqual(parked,);
    // And no tick of that quiet period created a budget ledger row.
    expect(await readLedger() ?? null,).toBeNull();
  });

  test("an unparseable route column is skipped without failing the tick", async () => {
    await makeWorld();
    await seedParty(PARTY_ONE, { route: "not json at all", },);
    await seedParty(PARTY_TWO,);

    // A corrupt row and a good row in the same tick: the corrupt one is
    // skipped, the good one still walks. The tick must not fail on the bad.
    const result = await advancePartyTravel(db, WORLD_ID, 1, travelContext(),);
    expect(result.actions.map((a,) => a.subjectId),).toEqual([PARTY_TWO,],);
    expect((await readParty(PARTY_ONE,)).route_index,).toBe(0,);
    expect((await readParty(PARTY_ONE,)).status,).toBe("traveling",);
  });

  test("a route that parses to a non-array is skipped the same way", async () => {
    await makeWorld();
    await seedParty(PARTY_ONE, { route: "{}", },);
    await seedParty(PARTY_TWO, { route: '"hello"', },);
    await seedParty("party-three",);

    // Parses cleanly but is not a list of stops — a different corrupt-row
    // shape that must take the same path as unparseable text.
    expect((await advancePartyTravel(db, WORLD_ID, 1, travelContext(),)).actions.map((a,) => a.subjectId),)
      .toEqual(["party-three",],);
    for (const id of [PARTY_ONE, PARTY_TWO,]) {
      expect((await readParty(id,)).route_index,).toBe(0,);
      expect((await readParty(id,)).travel_progress,).toBe(0,);
    }
  });

  test("a route shorter than two stops, or already at its end, is skipped", async () => {
    await makeWorld();
    await seedParty(PARTY_ONE, { route: JSON.stringify([LOC_A,],), },);
    await seedParty(PARTY_TWO, { routeIndex: 2, },);

    expect((await advancePartyTravel(db, WORLD_ID, 1, travelContext(),)).actions,).toEqual([],);
    expect((await readParty(PARTY_ONE,)).route_index,).toBe(0,);
    expect((await readParty(PARTY_TWO,)).route_index,).toBe(2,);
  });

  test("non-string stops are filtered out of an otherwise valid route", async () => {
    await makeWorld();
    await seedParty(PARTY_ONE, {
      route: JSON.stringify([LOC_A, 42, LOC_B,],),
    },);

    // The junk entry never becomes a destination, so the party walks A→B in
    // one tick rather than trying to arrive at a number.
    expect((await advancePartyTravel(db, WORLD_ID, 1, travelContext(),)).actions,).toHaveLength(1,);
    const party = await readParty(PARTY_ONE,);
    expect(party.route_index,).toBe(1,);
    expect(party.current_location_id,).toBe(LOC_B,);
  });
});

describe("advancePartyTravel — the budget ledger", () => {
  test("each action is charged ACTION_COST and the ledger persists the spend", async () => {
    await makeWorld();
    await seedParty(PARTY_ONE,);

    await advancePartyTravel(db, WORLD_ID, 1, travelContext(),);
    let ledger = await travelDb(db,)
      .selectFrom("world_travel_budget",)
      .select(["spent", "ceiling", "window_start_tick",],)
      .where("world_id", "=", WORLD_ID,)
      .executeTakeFirstOrThrow();
    expect(ledger.spent,).toBe(ACTION_COST,);
    expect(ledger.ceiling,).toBe(1,);
    expect(ledger.window_start_tick,).toBe(1,);

    await advancePartyTravel(db, WORLD_ID, 2, travelContext(),);
    const window = await travelDb(db,)
      .selectFrom("world_travel_budget",)
      .select("spent",)
      .where("world_id", "=", WORLD_ID,)
      .executeTakeFirstOrThrow();
    // 0.05 twice is exactly 0.1, not 0.10000000000000001 — the ledger counts
    // in micro-units precisely so money never becomes a float.
    expect(window.spent,).toBe(ACTION_COST * 2,);
  });

  test("an exhausted budget stops the tick and reports budgetExhausted", async () => {
    await makeWorld();
    // Nineteen actions' worth already spent inside this window, so one more
    // fits and the next cannot.
    await insertWorldTravelBudget(db, {
      world_id: WORLD_ID,
      spent: 0.95,
      ceiling: 1,
      window_start_tick: 1,
    },);
    await seedParty(PARTY_ONE,);

    expect((await advancePartyTravel(db, WORLD_ID, 1, travelContext(),)).budgetExhausted,).toBe(false,);
    expect((await readParty(PARTY_ONE,)).route_index,).toBe(1,);

    const result = await advancePartyTravel(db, WORLD_ID, 2, travelContext(),);
    expect(result.budgetExhausted,).toBe(true,);
    // A refused charge means the party did not move: `chargeBudget` refuses
    // rather than overspends, so the ceiling still bounds the world.
    expect(result.actions,).toEqual([],);
    expect((await readParty(PARTY_ONE,)).route_index,).toBe(1,);

    const ledger = await travelDb(db,)
      .selectFrom("world_travel_budget",)
      .select("spent",)
      .where("world_id", "=", WORLD_ID,)
      .executeTakeFirstOrThrow();
    expect(ledger.spent,).toBe(1,);
  });

  test("a new budget window restores the full ceiling", async () => {
    await makeWorld();
    await insertWorldTravelBudget(db, { world_id: WORLD_ID, spent: 1, ceiling: 1, window_start_tick: 1, },);
    // A four-stop route, so the party still has somewhere to go in the NEW
    // window. With a two-stop route it would already be resting by tick 11 and
    // this test would pass without proving anything about the window.
    await seedParty(PARTY_ONE, { route: JSON.stringify([LOC_A, LOC_B, LOC_C, LOC_A,],), },);

    // Tick 1 is still the same window: spent 1 of 1, nothing left. The charge
    // is refused, so the party holds its ground until the window rolls.
    const blocked = await advancePartyTravel(db, WORLD_ID, 1, travelContext(),);
    expect(blocked.budgetExhausted,).toBe(true,);
    expect(blocked.actions,).toEqual([],);
    expect((await readParty(PARTY_ONE,)).route_index,).toBe(0,);
    const afterRefusal = await readLedger();
    expect(afterRefusal?.spent,).toBe(1,);

    // The window spans ten ticks, so tick 11 opens the next one and the party
    // takes a real step, billed this time.
    const fresh = await advancePartyTravel(db, WORLD_ID, 11, travelContext(),);
    expect(fresh.budgetExhausted,).toBe(false,);
    expect(fresh.actions.map((a,) => a.subjectId),).toEqual([PARTY_ONE,],);
    // One billed step, not two: the refused tick 1 left the party where it was.
    expect((await readParty(PARTY_ONE,)).route_index,).toBe(1,);
    expect(await readLedger(),).toEqual({ spent: ACTION_COST, window_start_tick: 11, },);
  });

  test("a ceiling lower than one action funds nothing at all", async () => {
    await makeWorld();
    await seedParty(PARTY_ONE,);

    // No ledger row yet: the first charge opens the window, and 0.01 units
    // cannot pay a 0.05 action, so nothing moves and no ledger row is opened.
    const result = await advancePartyTravel(db, WORLD_ID, 1, travelContext(undefined, 0.01,),);
    expect(result.budgetExhausted,).toBe(true,);
    expect(result.actions,).toEqual([],);
    expect((await readParty(PARTY_ONE,)).route_index,).toBe(0,);
    expect((await readParty(PARTY_ONE,)).current_location_id,).toBe(LOC_A,);
  });

  test("an exhausted ceiling never lets a party advance for free, tick after tick", async () => {
    await makeWorld();
    // Four stops so the party is never `settled` — a settled party is skipped
    // before the charge and would pass this test for the wrong reason.
    await seedParty(PARTY_ONE, { route: JSON.stringify([LOC_A, LOC_B, LOC_C, LOC_A,],), });
    await insertWorldTravelBudget(db, {
      world_id: WORLD_ID,
      spent: 1,
      ceiling: 1,
      window_start_tick: 1,
    },);

    // Five ticks inside the same window. Under commit-then-charge every one
    // of these moved the party and billed nothing, so an exhausted world
    // walked its routes for free, unbounded.
    for (let tick = 1; tick <= 5; tick += 1) {
      const result = await advancePartyTravel(db, WORLD_ID, tick, travelContext(),);
      expect(result.budgetExhausted,).toBe(true,);
      expect(result.actions,).toEqual([],);
      expect((await readParty(PARTY_ONE,)).route_index,).toBe(0,);
    }
    expect(await readLedger(),).toEqual({ spent: 1, window_start_tick: 1, },);
  });

  test("two charges racing the last unit of ledger: one is accepted, the loser is told false", async () => {
    await makeWorld();
    // Room for exactly one more charge, so BOTH racers clear the ceiling
    // check and the compare-and-set is the only thing that can separate them.
    // `spent` sits off the 1e-6 grid on purpose: the unseeded insert stores a
    // raw `cost`, so a guard built on the micro round-trip would never match.
    await insertWorldTravelBudget(db, {
      world_id: WORLD_ID,
      spent: 0.1 + 0.2,
      ceiling: 0.4,
      window_start_tick: 1,
    },);

    // Genuinely concurrent, and deterministically so — no sleep, no mock.
    // `bun:sqlite` is synchronous, so both calls issue their SELECT before
    // either resumes to issue its UPDATE. Both therefore observe
    // spent = 0.30000000000000004 and compute the same next value.
    const raced = await Promise.all([
      chargeBudget(db, WORLD_ID, 1, 0.05, T0, 1,),
      chargeBudget(db, WORLD_ID, 1, 0.05, T0, 1,),
    ]);

    // Without the CAS both write that same value from the same pre-state,
    // both return true, and the ledger records one charge for two actions —
    // the ceiling under-counts and stops binding. With it, the loser's UPDATE
    // matches no row and it reports the refusal honestly.
    expect(raced.filter(Boolean,).length,).toBe(1,);
    expect(await readLedger(),).toEqual({ spent: 0.35, window_start_tick: 1, },);
  });
});

describe("migrateNpc — the relocation schedule", () => {
  /** A scheduled one-shot hop, departing at `depart` and landing at `arrive`. */
  async function seedMigration(
    id: string,
    opts: {
      departTick?: number;
      arriveTick?: number;
      cadence?: string;
      status?: string;
      lastDepartTick?: number;
      destination?: string | null;
    } = {},
  ): Promise<string> {
    await insertNpcMigrations(db, WORLD_ID, NPC_ID, opts.departTick ?? 2, opts.arriveTick ?? 5, {
      id,
      origin_location_id: LOC_A,
      destination_location_id: opts.destination === undefined ? LOC_C : opts.destination,
      cadence: opts.cadence ?? "scheduled",
      status: opts.status ?? "planned",
      last_depart_tick: opts.lastDepartTick ?? 0,
    },);
    return id;
  }

  test("a scheduled hop departs at depart_tick and arrives at arrive_tick", async () => {
    await makeWorld();
    await seedMigration("mig-sched", { departTick: 2, arriveTick: 5, },);
    const ctx = travelContext();

    // Before the schedule: nothing happens at all.
    expect((await migrateNpc(db, WORLD_ID, 1, ctx,)).actions,).toEqual([],);
    expect((await readMigration("mig-sched",)).status,).toBe("planned",);

    // Depart. The NPC has not moved yet — a migration row is a schedule,
    // not a move.
    expect((await migrateNpc(db, WORLD_ID, 2, ctx,)).actions,).toEqual([
      { kind: "npc_depart", subjectId: NPC_ID, tick: 2, cost: ACTION_COST, },
    ],);
    let row = await readMigration("mig-sched",);
    expect(row.status,).toBe("in_transit",);
    expect(row.last_depart_tick,).toBe(2,);
    expect(await readNpcLocation(),).toBe(LOC_A,);

    // In transit but not yet arrived: still no movement.
    expect((await migrateNpc(db, WORLD_ID, 3, ctx,)).actions,).toEqual([],);
    expect((await migrateNpc(db, WORLD_ID, 4, ctx,)).actions,).toEqual([],);

    // Arrive. The NPC's location changes and the hop closes out.
    expect((await migrateNpc(db, WORLD_ID, 5, ctx,)).actions,).toEqual([
      { kind: "npc_arrive", subjectId: NPC_ID, tick: 5, cost: ACTION_COST, },
    ],);
    row = await readMigration("mig-sched",);
    expect(row.status,).toBe("arrived",);
    expect(row.depart_tick,).toBe(2,);
    expect(row.arrive_tick,).toBe(5,);
    expect(await readNpcLocation(),).toBe(LOC_C,);

    // An arrived row is never reconsidered.
    expect((await migrateNpc(db, WORLD_ID, 6, ctx,)).actions,).toEqual([],);
    expect((await readMigration("mig-sched",)).status,).toBe("arrived",);
  });

  test("a late-running tick applies one transition per row, in schedule order", async () => {
    await makeWorld();
    await seedMigration("mig-late", { departTick: 2, arriveTick: 5, },);

    // The tick index jumped past both deadlines — a catch-up tick, or a
    // replay against a moved cursor. Only ONE transition applies per row per
    // tick: `planned` became `in_transit` here, arrival comes next.
    expect((await migrateNpc(db, WORLD_ID, 9, travelContext(),)).actions,).toEqual([
      { kind: "npc_depart", subjectId: NPC_ID, tick: 9, cost: ACTION_COST, },
    ],);
    expect((await readMigration("mig-late",)).status,).toBe("in_transit",);

    expect((await migrateNpc(db, WORLD_ID, 10, travelContext(),)).actions[0]?.kind,).toBe("npc_arrive",);
    expect((await readMigration("mig-late",)).status,).toBe("arrived",);
  });

  test("a continuous hop reschedules the next leg and flips origin and destination", async () => {
    await makeWorld();
    await seedMigration("mig-cont", { departTick: 0, arriveTick: 10, cadence: "continuous", },);
    const ctx = travelContext();

    expect((await migrateNpc(db, WORLD_ID, 0, ctx,)).actions[0]?.kind,).toBe("npc_depart",);
    expect((await readMigration("mig-cont",)).last_depart_tick,).toBe(0,);
    expect((await migrateNpc(db, WORLD_ID, 5, ctx,)).actions,).toEqual([],);

    // Arriving at 10 flips the pair, so the NPC shuttles back over the same
    // ten-tick span and the next hop is ready to leave immediately.
    expect((await migrateNpc(db, WORLD_ID, 10, ctx,)).actions[0]?.kind,).toBe("npc_arrive",);
    const row = await readMigration("mig-cont",);
    expect(row.status,).toBe("planned",);
    expect(row.depart_tick,).toBe(10,);
    expect(row.arrive_tick,).toBe(20,);
    expect(row.origin_location_id,).toBe(LOC_C,);
    expect(row.destination_location_id,).toBe(LOC_A,);
    expect(await readNpcLocation(),).toBe(LOC_C,);

    // The next leg is a full return trip. `reschedule` sets `depart_tick` to
    // the tick the hop COMPLETED, so the row is immediately due to leave —
    // at tick 20 the schedule says depart, not arrive.
    expect((await migrateNpc(db, WORLD_ID, 20, ctx,)).actions.map((a,) => a.kind),).toEqual(["npc_depart",],);
    expect((await readMigration("mig-cont",)).last_depart_tick,).toBe(20,);
    expect(await readNpcLocation(),).toBe(LOC_C,);

    // The span is the leg's own SCHEDULED length and must NOT decay leg over
    // leg. `reschedule` used to measure it against `last_depart_tick`, which
    // the depart write re-stamps one tick after each arrival — so every leg
    // came back one tick shorter (10, 10, 9, 8, 7 ...) and a continuous
    // migration degenerated into a jitter. Asserting the arrival is the only
    // way to see the decay: the first two legs happen to agree.
    expect((await migrateNpc(db, WORLD_ID, 30, ctx,)).actions.map((a,) => a.kind),).toEqual(["npc_arrive",],);
    const back = await readMigration("mig-cont",);
    expect(back.status,).toBe("planned",);
    expect(back.depart_tick,).toBe(30,);
    // A full third leg, not 31: the ten-tick span has to survive two round
    // trips or the shuttle is really a one-way trip that speeds up.
    expect(back.arrive_tick,).toBe(40,);
    expect(back.origin_location_id,).toBe(LOC_A,);
    expect(back.destination_location_id,).toBe(LOC_C,);
    expect(await readNpcLocation(),).toBe(LOC_A,);
  });

  test("an arrival whose destination was already claimed waits instead of double-arriving", async () => {
    await makeWorld();
    await seedMigration("mig-claim", { status: "in_transit", lastDepartTick: 0, departTick: 0, arriveTick: 5, },);
    // A party's arrival this tick already owns LOC_C.
    const result = await migrateNpc(db, WORLD_ID, 5, travelContext(new Set([LOC_C,],),),);

    expect(result.deferred,).toBe(1,);
    expect(result.actions,).toEqual([],);
    // Still in transit: it retries next tick, when the slot is free again.
    expect((await readMigration("mig-claim",)).status,).toBe("in_transit",);
    expect(await readNpcLocation(),).toBe(LOC_A,);

    const next = await migrateNpc(db, WORLD_ID, 6, travelContext(new Set(),),);
    expect(next.actions[0]?.kind,).toBe("npc_arrive",);
    expect(await readNpcLocation(),).toBe(LOC_C,);
  });

  test("a departure with no destination closes the hop out instead of retrying forever", async () => {
    await makeWorld();
    // The destination was deleted — the column is `set null` on delete.
    await seedMigration("mig-nowhere", { departTick: 3, arriveTick: 5, destination: null, },);

    // No action — the schedule is closed out silently rather than leaving a
    // row that retries a destination which no longer exists.
    expect((await migrateNpc(db, WORLD_ID, 3, travelContext(),)).actions,).toEqual([],);
    expect((await readMigration("mig-nowhere",)).status,).toBe("arrived",);
    expect(await readNpcLocation(),).toBe(LOC_A,);

    // The ledger was never opened: a closed-out schedule is not billable.
    const ledger = await travelDb(db,)
      .selectFrom("world_travel_budget",)
      .selectAll()
      .where("world_id", "=", WORLD_ID,)
      .executeTakeFirst();
    expect(ledger,).toBeUndefined();
  });

  test("an exhausted budget stops the migration tick before the departure", async () => {
    await makeWorld();
    await seedMigration("mig-budget", { departTick: 3, arriveTick: 5, },);
    await insertWorldTravelBudget(db, {
      world_id: WORLD_ID,
      spent: 1,
      ceiling: 1,
      window_start_tick: 3,
    },);

    const result = await migrateNpc(db, WORLD_ID, 3, travelContext(),);
    expect(result.budgetExhausted,).toBe(true,);
    expect(result.actions,).toEqual([],);
    expect((await readMigration("mig-budget",)).status,).toBe("planned",);
    // A refused charge leaves the NPC where it was.
    expect(await readNpcLocation(),).toBe(LOC_A,);
  });

  test("another world's migrations are not driven", async () => {
    await makeWorld();
    await insertNpcMigrations(db, OTHER_WORLD_ID, NPC_ID, 0, 5, {
      id: "mig-foreign",
      origin_location_id: LOC_A,
      destination_location_id: LOC_C,
      status: "planned",
    },);

    expect((await migrateNpc(db, WORLD_ID, 3, travelContext(),)).actions,).toEqual([],);
    expect((await readMigration("mig-foreign",)).status,).toBe("planned",);
  });
});

describe("party travel and migration contend for one arrival per location", () => {
  test("the party's arrival wins and the migration defers, then the migration lands", async () => {
    await makeWorld();
    await seedParty(PARTY_ONE, { route: JSON.stringify([LOC_A, LOC_C,],), },);
    await insertNpcMigrations(db, WORLD_ID, NPC_ID, 0, 5, {
      id: "mig-share",
      origin_location_id: LOC_A,
      destination_location_id: LOC_C,
      status: "in_transit",
      last_depart_tick: 0,
    },);

    // ONE shared claim set for the whole tick, exactly as the dispatch does
    // it: travel runs first, so the party's arrival owns LOC_C.
    const claims = new Set<string>();
    const travel = await advancePartyTravel(db, WORLD_ID, 5, travelContext(claims,),);
    expect(travel.actions.map((a,) => a.subjectId),).toEqual([PARTY_ONE,],);
    expect(claims,).toEqual(new Set([LOC_C,],),);

    const migration = await migrateNpc(db, WORLD_ID, 5, travelContext(claims,),);
    expect(migration.deferred,).toBe(1,);
    expect(migration.actions,).toEqual([],);

    // Next tick the dispatch builds a FRESH claim set, so the slot is free and
    // the migration completes.
    const later = await migrateNpc(db, WORLD_ID, 6, travelContext(new Set(),),);
    expect(later.actions[0]?.kind,).toBe("npc_arrive",);
    expect(later.deferred,).toBe(0,);
    expect(await readNpcLocation(),).toBe(LOC_C,);
  });
});

describe("replaying a tick must not apply a party's move twice", () => {
  /**
   * `travel_parties.current_tick` is the replay latch migration 036 nominates
   * ("the same idea one column over" from discovery's `last_explored_tick`).
   * The write is guarded on `current_tick < tick`, so a tick the scheduler
   * replays after a crash matches no row.
   *
   * This was previously pinned as a KNOWN BUG asserting the opposite — the
   * latch was missing. It is now asserted the right way round: a replay is a
   * no-op on the row AND on the ledger. If the guard is ever weakened, this
   * test fails; that is the point of keeping it.
   */
  test("a replayed tick moves the party once and charges once", async () => {
    await makeWorld();
    await seedParty(PARTY_ONE,);
    const ctx = travelContext();

    const first = await advancePartyTravel(db, WORLD_ID, 1, ctx,);
    expect(first.actions.map((a,) => a.subjectId),).toEqual([PARTY_ONE,],);
    const afterFirst = await readParty(PARTY_ONE,);
    expect(afterFirst.route_index,).toBe(1,);
    expect(afterFirst.current_location_id,).toBe(LOC_B,);
    expect(afterFirst.current_tick,).toBe(1,);

    // The same tick again. The party's position is a function of
    // (world + seed + tick) — the property the module header claims — so a
    // replay must land exactly where the first pass left it, and must not
    // bill the world a second time.
    const replay = await advancePartyTravel(db, WORLD_ID, 1, ctx,);
    expect(replay.actions,).toEqual([],);

    const afterReplay = await readParty(PARTY_ONE,);
    expect(afterReplay.route_index,).toBe(1,);
    expect(afterReplay.current_location_id,).toBe(LOC_B,);
    expect(afterReplay.status,).toBe("traveling",);
    expect(afterReplay.current_tick,).toBe(1,);

    const ledger = await travelDb(db,)
      .selectFrom("world_travel_budget",)
      .select("spent",)
      .where("world_id", "=", WORLD_ID,)
      .executeTakeFirstOrThrow();
    expect(ledger.spent,).toBe(ACTION_COST,);
  });

  test("a brand-new party still walks on the scheduler's FIRST tick", async () => {
    await makeWorld();
    await seedParty(PARTY_ONE,);

    // `world_simulation_state.tick_count` starts at 0, so the first tick a
    // world ever runs IS tick 0. The latch is `WHERE current_tick < tick`, so
    // a 0 default for the column would read as "this party already advanced on
    // tick 0" and lock every new party out of exactly one tick — the only tick
    // guaranteed to happen. The column therefore defaults to -1.
    const fresh = await readParty(PARTY_ONE,);
    expect(fresh.current_tick,).toBe(-1,);

    const result = await advancePartyTravel(db, WORLD_ID, 0, travelContext(),);
    expect(result.actions.map((a,) => a.subjectId),).toEqual([PARTY_ONE,],);
    const after = await readParty(PARTY_ONE,);
    expect(after.route_index,).toBe(1,);
    expect(after.current_location_id,).toBe(LOC_B,);
    expect(after.current_tick,).toBe(0,);
  });
});
