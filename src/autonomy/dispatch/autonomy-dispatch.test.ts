// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Seeded replay of a world tick, end to end through the real
 * `AutonomyScheduler` and its built-in movement dispatch.
 *
 * The headline acceptance criterion: a world's tick is re-derivable from
 * `(seed, worldId, tickIndex)`. Replay the same tick against the same
 * starting state and the NPC walks to the same place. A WANDER NPC is used
 * because its destination is the only thing in a movement tick that draws
 * from the tick RNG.
 *
 * Every run drives `Math.random` with a DIFFERENT value:
 *   - seeded world: the two runs still agree, so an implementation that
 *     leaked `Math.random` (or ignored `seed`) would send them apart and
 *     go red. The equality is not an accident of a constant stub.
 *   - unseeded world: the runs differ, which is exactly what `seed: null`
 *     must keep doing.
 *   - a different seed, and a different tick index, each move somewhere
 *     else — so "the runs agreed" can never mean "the NPC stood still" or
 *     "it always picks the same place".
 *
 * Replay harness trap: resetting only the tick cursor is a FALSE NEGATIVE.
 * Run 2 then samples over a different connection list, so the destinations
 * differ for a reason unrelated to the RNG. `resetWorld` restores the
 * NPC's location, the cursor and the budget, so run 2 sees run 1's
 * starting state. (`npc_states` has no `last_moved_at` column, so there
 * is nothing to reset there.)
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
import { toDate, } from "../../utils/date";
import { AutonomyScheduler, } from "../scheduler";

let db: Kysely<DB>;

/** Fixed instant so the cursor arithmetic is exact. */
const T0 = 1_800_000_000_000;

/** Literal ids: the seed is folded over the world id, so a random id would
 *  make the derived stream — and the destination it implies — differ
 *  between the two runs being compared. */
const WORLD_ID = "world-seed-replay";
const NPC_ID = "npc-seed-replay";
const LOC_A = "loc-seed-a";
const LOC_B = "loc-seed-b";
const LOC_C = "loc-seed-c";
const LOC_D = "loc-seed-d";

/** The world's locations in the order a scan of `location_states` returns
 *  them. Wander draws `floor(draw * connections.length)` over that list
 *  minus wherever the NPC currently is, capped at five — so the expected
 *  destination is checkable without re-deriving the movement pipeline.
 *  Ids are alphabetical so the order is also the table's key order. */
const ORDERED_LOCATIONS = [LOC_A, LOC_B, LOC_C, LOC_D,];

function connectionsFrom(locationId: string,): string[] {
  return ORDERED_LOCATIONS.filter((id,) => id !== locationId).slice(0, 5,);
}

/** Where each seeded tick is expected to land, pinned as literals.
 *
 *  One row per tick index, carrying BOTH seeds' destinations for the same
 *  `(worldId, tickIndex)` — the mulberry32 draws, indexed into the three
 *  connections reachable from LOC_A:
 *    tick | seed 101 draw -> dest | seed 202 draw -> dest
 *      0  | 0.092439 -> LOC_B | 0.886167 -> LOC_D
 *      1  | 0.550735 -> LOC_C | 0.700990 -> LOC_D
 *      2  | 0.473915 -> LOC_C | 0.136950 -> LOC_B
 *      3  | 0.806217 -> LOC_D | 0.852252 -> LOC_D
 *      4  | 0.984593 -> LOC_D | 0.564487 -> LOC_C
 *      5  | 0.588565 -> LOC_C | 0.785036 -> LOC_D
 *
 *  Deliberately NOT re-derived from `deriveTickRng` in the test: an
 *  expectation computed with the code under test tracks the code under
 *  test, so a break in the derivation moves the expectation too and the
 *  suite stays green. Literals make these assertions falsifiable — a change
 *  to the derivation (or to the world id) fails here loudly, which is the
 *  point.
 *
 *  The two seeds share a row rather than living in two tables keyed by
 *  tick: a `Record<number, string>` lookup widens to `string | undefined`
 *  under `noUncheckedIndexedAccess`, and more importantly a tick present in
 *  one table and missing from the other would compare against `undefined`
 *  at runtime instead of failing to compile. One row per tick makes that
 *  mistake unrepresentable.
 */
const SEEDED_DESTINATION = [
  { tick: 0, dest: LOC_B, otherSeedDest: LOC_D, },
  { tick: 1, dest: LOC_C, otherSeedDest: LOC_D, },
  { tick: 2, dest: LOC_C, otherSeedDest: LOC_B, },
  { tick: 3, dest: LOC_D, otherSeedDest: LOC_D, },
  { tick: 4, dest: LOC_D, otherSeedDest: LOC_C, },
  { tick: 5, dest: LOC_C, otherSeedDest: LOC_D, },
] as const;

/** Resource contract for this file:
 *  - `db` is a private `:memory:` SQLite handle created per test, so no
 *    suite or test shares DB state.
 *  - the fixture ids (WORLD_ID, NPC_ID, LOC_*) are module constants, but
 *    they only ever collide inside a single test's own database, which is
 *    exactly the scope that wants them fixed (the seed is folded over the
 *    world id, so a random one would make the derived stream vary).
 *  - `Math.random` is process-wide, so it is never held across tests: the
 *    seeded tests do not touch it at all, and the one unseeded test pins it
 *    through `withRandom`, which restores in a `finally`. A test in another
 *    file running concurrently cannot observe a stub left behind, and a
 *    failure here cannot poison them either.
 *  - tests share no ordering dependency: each builds its own world from
 *    scratch and none reads another's writes.
 */
beforeEach(async () => {
  ({ db, } = await createTestDb());
},);

afterEach(async () => {
  await db.destroy();
},);

/** A world with one WANDER NPC at LOC_A and three other locations, so
 *  wander has three connections to choose between and the tick RNG's
 *  first draw is `floor(draw * 3)`.
 *
 *  `jitterRatio: 0` keeps the jitter gate from consuming a draw and
 *  dropping the tick, so the first draw is the destination.
 * @param seed `null` = unseeded (organic path); a number pins the stream
 */
async function makeWanderWorld(seed: number | null,): Promise<void> {
  const ownerId = "user-seed-owner";
  await insertUsers(db, "owner", "Owner", { id: ownerId, },);
  await insertWorlds(db, ownerId, "Seed Replay", {
    id: WORLD_ID,
    autonomy_config: JSON.stringify({ jitterRatio: 0, seed, },),
  },);

  await insertChats(db, "chat-seed", ownerId, { world_id: WORLD_ID, },);

  await insertLocations(db, WORLD_ID, "A", { id: LOC_A, },);
  await insertLocations(db, WORLD_ID, "B", { id: LOC_B, },);
  await insertLocations(db, WORLD_ID, "C", { id: LOC_C, },);
  await insertLocations(db, WORLD_ID, "D", { id: LOC_D, },);
  for (const id of ORDERED_LOCATIONS) {
    await insertLocationStates(db, id, WORLD_ID,);
  }

  await insertActors(db, "Wanderer", { id: NPC_ID, actor_type: "character", agent_type: "npc", },);
  await insertNpcStates(db, NPC_ID, WORLD_ID, {
    location_id: LOC_A,
    schedule: JSON.stringify({ movementPattern: MovementPattern.Wander, },),
  },);

  // Pin the fixture: wander needs three reachable places for a draw to
  // have any range at all.
  expect(connectionsFrom(LOC_A,),).toEqual([LOC_B, LOC_C, LOC_D,],);
}

/** The world's cursor: due, unpaused, at `tickIndex`. */
async function setCursor(tickIndex: number,): Promise<void> {
  await db.deleteFrom("world_simulation_state",).where("world_id", "=", WORLD_ID,).execute();
  await db
    .insertInto("world_simulation_state",)
    .values({
      world_id: WORLD_ID,
      next_tick_at: toDate(T0 - 10_000,).toISOString(),
      paused: 0,
      tick_count: tickIndex,
      last_run_at: null,
      last_error: null,
    },)
    .execute();
}

/** Put the world back into its pre-tick state: NPC at LOC_A with the
 *  original schedule, cursor back at 0 and due, budget unspent. */
async function resetWorld(): Promise<void> {
  await db.deleteFrom("npc_states",).where("actor_id", "=", NPC_ID,).execute();
  await insertNpcStates(db, NPC_ID, WORLD_ID, {
    location_id: LOC_A,
    schedule: JSON.stringify({ movementPattern: MovementPattern.Wander, },),
  },);

  await db.deleteFrom("autonomy_budget",).execute();
  await setCursor(0,);
}

/** Run one real tick and report where the NPC ended up.
 *
 *  `Math.random` is NOT stubbed. The scheduler's own stream is derived
 *  from the world config, so a seeded tick must never consult the global
 *  anyway — and the pinned SEEDED_DESTINATION literals are what prove it:
 *  a tick that fell through to a real `Math.random` would land somewhere
 *  else and miss them. That keeps the common path free of global mutation
 *  entirely, which matters because `Math.random` is process-wide state
 *  shared with every other test in the run.
 *
 *  Only `seed: null` needs the global driven, and it does so inside
 *  `withRandom` below, which restores it in a `finally` so a failing
 *  assertion cannot leak the stub into the rest of the suite.
 */
async function runTick(): Promise<string | null> {
  const sched = new AutonomyScheduler(db,);
  const result = await sched.tickOnce(T0,);
  expect(result.errors,).toBe(0,);
  // The NPC moved. Without this, "both runs agreed" would also be true of
  // a tick that moved nobody.
  expect(result.worlds[0]?.outcome,).toEqual({ dispatched: 1, },);
  const row = await db
    .selectFrom("npc_states",)
    .select("location_id",)
    .where("actor_id", "=", NPC_ID,)
    .executeTakeFirstOrThrow();

  return row.location_id;
}

/** Run `fn` with `Math.random` pinned to `value`, restoring it even if
 *  `fn` throws. Required for the unseeded case: `deriveTickRng` returns
 *  the real `Math.random` for `seed: null`, so pinning it is the only way
 *  to assert which place the organic draw picked. */
async function withRandom<T,>(value: number, fn: () => Promise<T>,): Promise<T> {
  const real = Math.random;
  Math.random = () => value;
  try {
    return await fn();
  } finally {
    Math.random = real;
  }
}

describe("AutonomyScheduler — seeded replay", () => {
  test("replaying any tick reproduces its destination exactly", async () => {
    await makeWanderWorld(101,);

    // A sweep, not a single tick. A one-tick check can only catch a
    // seed-ignoring break two times in three: the tick has three
    // destinations to pick from, so a random draw matches the expected one
    // one time in three and the guard silently passes. Six ticks make that
    // (1/3)^6 — a regression cannot hide. The expected destinations are the
    // mulberry32 draws for this fixture, one per tick index; each tick is
    // replayed from a full world reset and must land in the same place.
    const observed: string[] = [];
    for (const tick of SEEDED_DESTINATION) {
      await resetWorld();
      await setCursor(tick.tick,);
      const first = await runTick();
      await resetWorld();
      await setCursor(tick.tick,);
      const second = await runTick();

      expect(first,).toBe(second,);
      expect(first,).toBe(tick.dest,);
      expect(first,).not.toBe(LOC_A,);
      observed.push(first ?? "null",);
    }

    // The sweep is not degenerate: the NPC really did visit more than one
    // place across it, so "all ticks agree" is not the shape of the data.
    expect(new Set(observed,).size,).toBeGreaterThan(1,);
  });

  test("a different seed sends the same world elsewhere", async () => {
    await makeWanderWorld(101,);

    for (const tick of SEEDED_DESTINATION) {
      // The seed is written back every iteration: the previous one left
      // the world on 202, so without this the "seed 101" run of tick N+1
      // would really be a second seed-202 run.
      await db
        .updateTable("worlds",)
        .set({ autonomy_config: JSON.stringify({ jitterRatio: 0, seed: 101, },), },)
        .where("id", "=", WORLD_ID,)
        .execute();

      await resetWorld();
      await setCursor(tick.tick,);
      const fromSeed101 = await runTick();

      // Same world, same fixture, same tick index — only the seed changes.
      await db
        .updateTable("worlds",)
        .set({ autonomy_config: JSON.stringify({ jitterRatio: 0, seed: 202, },), },)
        .where("id", "=", WORLD_ID,)
        .execute();

      await resetWorld();
      await setCursor(tick.tick,);
      const fromSeed202 = await runTick();

      // A shared per-world stream would replay seed 101's destination here.
      expect(fromSeed202,).toBe(tick.otherSeedDest,);
      expect(fromSeed101,).toBe(tick.dest,);
    }
  });

  test("seed: null keeps the organic path — runs differ", async () => {
    await makeWanderWorld(null,);
    await setCursor(0,);

    // floor(0.9 * 3) = 2 and floor(0.02 * 3) = 0, so each run lands where
    // its own draw puts it. Pinning the global for the duration of the
    // tick is the only way to assert WHICH place the organic draw chose:
    // left to chance the two runs would collide one time in three, which
    // is a flaky test rather than a check.
    const first = await withRandom(0.9, runTick,);
    await resetWorld();
    const second = await withRandom(0.02, runTick,);

    expect(first,).toBe(LOC_D,);
    expect(second,).toBe(LOC_B,);
    expect(first,).not.toBe(second,);
  });
});
