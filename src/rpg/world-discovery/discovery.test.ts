// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/world-discovery/discovery.test.ts — `runDiscoveryTick`
 *
 * Exploration accrual, decay, and the exactly-once `location:discovered`
 * announcement. The whole module is a pure function of (stored progress,
 * tick index) plus a storage-layer latch, so the fixture is a world, two
 * locations, and whatever `location_discovery` rows a case needs — every
 * expectation below is a literal, never an expression derived from the
 * constants under test.
 *
 * Replay harness trap: a row that has already been written carries
 * `last_explored_tick`, and progress RECOMPUTES from that column. Re-running
 * a tick is therefore a no-op by construction, and one case asserts that
 * no-op rather than assuming it — the multi-tick cases advance the tick
 * index, and only the dedicated replay case re-uses it.
 *
 * Rate arithmetic is pinned, not imported: a tick an actor is PRESENT at
 * gains `EXPLORE_GAIN - DECAY_PER_TICK` (the code's single recompute rate),
 * and a tick it is ABSENT for loses exactly `DECAY_PER_TICK`. The literals
 * 3.5 and 0.5 below are what make a change to either constant fail here.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertLocationDiscovery,
  insertLocations,
  insertNpcStates,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { runDiscoveryTick, } from "./discovery";
import { discoveredKey, } from "./events";
import { DECAY_PER_TICK, DISCOVERY_THRESHOLD, EXPLORE_GAIN, } from "./progress";
import { discoveryDb, LOCATION_DISCOVERED, } from "./types";

let db: Kysely<DB>;

/** Fixed instant. Only ever written to `updated_at` — never read for logic. */
const T0 = 1_800_000_000_000;

/** Literal ids: expectations below are literals, so ids must be too. */
const WORLD_ID = "world-discovery";
const OTHER_WORLD_ID = "world-discovery-other";
const LOC_A = "loc-disc-a";
const LOC_B = "loc-disc-b";
const NPC_ONE = "npc-disc-one";
const NPC_TWO = "npc-disc-two";

/** One tick of presence: gain 4, decay 0.5, so +3.5. Pinned as a literal. */
const PRESENT_STEP = 3.5;

beforeEach(async () => {
  ({ db, } = await createTestDb());
},);

afterEach(async () => {
  await db.destroy();
},);

/** One owner, two worlds, two locations, two actors. No chat is needed —
 *  discovery reads `npc_states` and `locations` only. */
async function makeWorld(): Promise<void> {
  const ownerId = "user-disc-owner";
  await insertUsers(db, "disc-owner", "Owner", { id: ownerId, },);
  await insertWorlds(db, ownerId, "Discovery World", { id: WORLD_ID, },);
  await insertWorlds(db, ownerId, "Other World", { id: OTHER_WORLD_ID, },);
  await insertLocations(db, WORLD_ID, "A", { id: LOC_A, },);
  await insertLocations(db, WORLD_ID, "B", { id: LOC_B, },);
  await insertActors(db, "Seeker One", { id: NPC_ONE, actor_type: "character", agent_type: "npc", },);
  await insertActors(db, "Seeker Two", { id: NPC_TWO, actor_type: "character", agent_type: "npc", },);
}

/** Put an actor somewhere. Omit `locationId` to leave the actor nowhere at
 *  all — `readPresence` filters on a non-null `location_id`, which is what
 *  makes "absent" mean absent rather than "somewhere unknown". */
async function placeNpc(actorId: string, locationId?: string, worldId = WORLD_ID,): Promise<void> {
  await insertNpcStates(db, actorId, worldId, {
    ...(locationId === undefined ? {} : { location_id: locationId, }),
  },);
}

/** One stored progress row, as a previous tick left it. */
async function seedRow(
  actorId: string,
  locationId: string,
  progress: number,
  lastExploredTick: number,
  discovered = 0,
): Promise<void> {
  await insertLocationDiscovery(db, WORLD_ID, locationId, actorId, {
    progress,
    last_explored_tick: lastExploredTick,
    discovered,
    ...(discovered === 1 ? { discovered_tick: lastExploredTick, } : {}),
  },);
}

/** The stored row for one (location, actor) pair. */
async function readRow(actorId: string, locationId: string,) {
  const row = await discoveryDb(db,)
    .selectFrom("location_discovery",)
    .select(["progress", "last_explored_tick", "discovered", "discovered_tick",],)
    .where("world_id", "=", WORLD_ID,)
    .where("location_id", "=", locationId,)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();

  if (!row) { throw new Error(`no location_discovery row for ${locationId}/${actorId}`,); }
  return row;
}

/** Every `location:discovered` row this world has logged. */
async function readDiscoveredEvents() {
  return discoveryDb(db,)
    .selectFrom("world_event_log",)
    .select(["subject_id", "actor_id", "tick_index", "dedupe_key",],)
    .where("world_id", "=", WORLD_ID,)
    .where("event_type", "=", LOCATION_DISCOVERED,)
    .orderBy("tick_index", "asc",)
    .execute();
}

/** Run one discovery tick at `tickIndex` and return its result. */
async function tick(tickIndex: number,) {
  return runDiscoveryTick(discoveryDb(db,), WORLD_ID, tickIndex, T0,);
}

describe("runDiscoveryTick — exploration accrual", () => {
  test("an actor at an uncharted location accrues one tick of gain, then keeps accruing", async () => {
    await makeWorld();
    await placeNpc(NPC_ONE, LOC_A,);

    // No row exists yet: the pair is seeded inside the tick rather than
    // needing a pre-seed, and is written at the recomputed value.
    const first = await tick(1,);
    expect(first,).toEqual({ explored: 1, discovered: 0, events: 0, },);

    const afterFirst = await readRow(NPC_ONE, LOC_A,);
    expect(afterFirst.progress,).toBe(PRESENT_STEP,);
    expect(afterFirst.last_explored_tick,).toBe(1,);

    const second = await tick(2,);
    expect(second.explored,).toBe(1,);
    const afterSecond = await readRow(NPC_ONE, LOC_A,);
    expect(afterSecond.progress,).toBe(PRESENT_STEP * 2,);
    expect(afterSecond.last_explored_tick,).toBe(2,);

    // The gain is EXPLORE_GAIN less the decay that fires on the same tick.
    expect(PRESENT_STEP,).toBe(EXPLORE_GAIN - DECAY_PER_TICK,);
    expect(afterSecond.progress,).toBeLessThan(DISCOVERY_THRESHOLD,);
  });

  test("the world's very first tick explores, not the second", async () => {
    await makeWorld();
    await placeNpc(NPC_ONE, LOC_A,);

    // `world_simulation_state.tick_count` starts at 0, so the first tick a
    // world runs IS tick 0. Every other case here starts at tick 1, which is
    // exactly the gap this covers.
    //
    // The pair is seeded INSIDE the tick and written at the recomputed value,
    // so it never reads the column default. The default is still -1 rather
    // than 0 for the same reason as `travel_parties.current_tick`: a row
    // inserted by anything other than `persist` would otherwise read as
    // "recomputed on tick 0" and match no rows on the guarded UPDATE.
    expect(await tick(0,),).toEqual({ explored: 1, discovered: 0, events: 0, },);

    const row = await readRow(NPC_ONE, LOC_A,);
    expect(row.progress,).toBe(PRESENT_STEP,);
    expect(row.last_explored_tick,).toBe(0,);

    // And the tick after it still works — tick 0 was consumed, not replayed.
    expect(await tick(1,),).toEqual({ explored: 1, discovered: 0, events: 0, },);
    expect((await readRow(NPC_ONE, LOC_A,)).progress,).toBe(PRESENT_STEP * 2,);
  });

  test("an actor who moves leaves its old row behind and starts a fresh pair", async () => {
    await makeWorld();
    await seedRow(NPC_ONE, LOC_A, 10, 0,);
    await placeNpc(NPC_ONE, LOC_B,);

    const result = await tick(1,);
    expect(result.explored,).toBe(2,);

    // Rows key on the PAIR, so the vacated location decays while the new one
    // accrues — a row is one actor's progress, never the location's.
    expect((await readRow(NPC_ONE, LOC_A,)).progress,).toBe(9.5,);
    expect((await readRow(NPC_ONE, LOC_B,)).progress,).toBe(PRESENT_STEP,);
  });

  test("with no actor present, progress decays by DECAY_PER_TICK and never below 0", async () => {
    await makeWorld();
    await seedRow(NPC_ONE, LOC_A, 10, 0,);
    await seedRow(NPC_TWO, LOC_B, 0.2, 0,);
    // Neither actor is placed anywhere — both rows are absent pairs.

    expect(await tick(1,),).toEqual({ explored: 2, discovered: 0, events: 0, },);
    expect((await readRow(NPC_ONE, LOC_A,)).progress,).toBe(9.5,);

    // 0.2 - 0.5 would be negative; the clamp floors it at 0 and keeps it
    // there for the next tick rather than letting the row go below 0 (the
    // table's CHECK constraint would reject that write outright).
    expect((await readRow(NPC_TWO, LOC_B,)).progress,).toBe(0,);
    expect(await tick(2,),).toEqual({ explored: 2, discovered: 0, events: 0, },);
    expect((await readRow(NPC_ONE, LOC_A,)).progress,).toBe(9,);
    expect((await readRow(NPC_TWO, LOC_B,)).progress,).toBe(0,);
  });

  test("replaying the same tick writes nothing at all", async () => {
    await makeWorld();
    await seedRow(NPC_ONE, LOC_A, 10, 0,);
    await placeNpc(NPC_ONE, LOC_A,);

    expect((await tick(1,)).explored,).toBe(1,);
    const afterFirst = await readRow(NPC_ONE, LOC_A,);
    expect(afterFirst.progress,).toBe(10 + PRESENT_STEP,);

    // Same tick again: `last_explored_tick` already equals it, so the
    // guarded UPDATE matches no rows and the INSERT loses the PK conflict.
    // No state moved — a replay is a no-op by construction, not by a flag.
    expect(await tick(1,),).toEqual({ explored: 0, discovered: 0, events: 0, },);
    expect(await readRow(NPC_ONE, LOC_A,),).toEqual(afterFirst,);
  });
});

describe("runDiscoveryTick — the exactly-once announcement", () => {
  test("crossing the threshold emits location:discovered once and latches the row", async () => {
    await makeWorld();
    await placeNpc(NPC_ONE, LOC_A,);
    // One tick of presence is enough to carry 99 over the line.
    await seedRow(NPC_ONE, LOC_A, 99, 0,);

    expect(await tick(1,),).toEqual({ explored: 1, discovered: 1, events: 1, },);

    const events = await readDiscoveredEvents();
    expect(events,).toEqual([{
      subject_id: LOC_A,
      actor_id: NPC_ONE,
      tick_index: 1,
      // Location-scoped, no tick — the key is what stops a twin later.
      dedupe_key: discoveredKey(WORLD_ID, LOC_A,),
    },],);

    const latched = await readRow(NPC_ONE, LOC_A,);
    expect(latched.progress,).toBe(DISCOVERY_THRESHOLD,);
    expect(latched.discovered,).toBe(1,);
    expect(latched.discovered_tick,).toBe(1,);
  });

  test("a later tick past the threshold emits no twin", async () => {
    await makeWorld();
    await placeNpc(NPC_ONE, LOC_A,);
    await seedRow(NPC_ONE, LOC_A, 99, 0,);
    await tick(1,);

    // Two more ticks. A charted row stops accruing entirely, so this is a
    // no-op for a different reason than the replay guard above: the tick
    // never reaches `recompute` at all.
    expect(await tick(2,),).toEqual({ explored: 0, discovered: 0, events: 0, },);
    expect(await tick(3,),).toEqual({ explored: 0, discovered: 0, events: 0, },);
    expect(await readDiscoveredEvents(),).toHaveLength(1,);
  });

  test("two actors crossing one location on one tick latch both rows but announce once", async () => {
    await makeWorld();
    await placeNpc(NPC_ONE, LOC_A,);
    await placeNpc(NPC_TWO, LOC_A,);
    await seedRow(NPC_ONE, LOC_A, 99, 0,);
    await seedRow(NPC_TWO, LOC_A, 99, 0,);

    // `discovered` counts ROWS that crossed — both did, which is true. Only
    // the event is location-scoped, so `events` is 1.
    expect(await tick(1,),).toEqual({ explored: 2, discovered: 2, events: 1, },);
    expect(await readDiscoveredEvents(),).toHaveLength(1,);
    expect((await readRow(NPC_ONE, LOC_A,)).discovered,).toBe(1,);
    expect((await readRow(NPC_TWO, LOC_A,)).discovered,).toBe(1,);
  });

  test("a location already charted by one actor is never announced again for another", async () => {
    await makeWorld();
    await placeNpc(NPC_ONE, LOC_A,);
    await seedRow(NPC_ONE, LOC_A, 99, 0,);
    expect(await tick(1,),).toEqual({ explored: 1, discovered: 1, events: 1, },);

    // A companion arrives at the same location and charts it themselves on a
    // LATER tick. The row still latches — the find was real for them — but
    // the insert loses on the location-scoped dedupe key, so `events` is 0.
    // Without that key this would announce the same find twice.
    await placeNpc(NPC_TWO, LOC_A,);
    await seedRow(NPC_TWO, LOC_A, 99, 1,);
    expect(await tick(2,),).toEqual({ explored: 1, discovered: 1, events: 0, },);
    expect((await readRow(NPC_TWO, LOC_A,)).discovered,).toBe(1,);

    // Still the one event, still attributed to the actor who charted it
    // first — the loser's row is not rewritten onto the log.
    expect(await readDiscoveredEvents(),).toEqual([{
      subject_id: LOC_A,
      actor_id: NPC_ONE,
      tick_index: 1,
      dedupe_key: discoveredKey(WORLD_ID, LOC_A,),
    },],);
  });

  test("another world's charted location never appears in this world's log", async () => {
    await makeWorld();
    await insertLocations(db, OTHER_WORLD_ID, "Elsewhere", { id: "loc-disc-other", },);
    await placeNpc(NPC_ONE, "loc-disc-other", OTHER_WORLD_ID,);
    await insertLocationDiscovery(db, OTHER_WORLD_ID, "loc-disc-other", NPC_ONE, {
      progress: 99,
      last_explored_tick: 0,
      discovered: 0,
    },);

    expect(await tick(1,),).toEqual({ explored: 0, discovered: 0, events: 0, },);
    expect(await readDiscoveredEvents(),).toHaveLength(0,);
  });
});
