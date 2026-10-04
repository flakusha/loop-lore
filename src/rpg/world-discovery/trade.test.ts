// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/world-discovery/trade.test.ts — `runTradeTick`, `emitWorldEvent`,
 * `listWorldEvents`
 *
 * The convoy event is keyed on the tick AND the subject, which is the
 * opposite scoping from `location:discovered`: a convoy is legitimately in
 * motion on many ticks, so it fires once per tick; a replay of THAT tick
 * fires nothing. Both halves are pinned, because a key scoped to either
 * subject alone or tick alone would still produce a plausible-looking log.
 *
 * `emitWorldEvent` and `listWorldEvents` are in scope here because they are
 * the only two functions that touch `world_event_log` — the dedupe property
 * the tick depends on lives in the insert's conflict clause, not in a
 * convention, so it has to be proven against the storage layer directly.
 *
 * Every `subject_id` / `dedupe_key` below is a literal. A migration convoy's
 * subject is namespaced `actor:<row id>` so it can never collide with a party
 * id, and that is asserted rather than assumed.
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
  insertTradeHistory,
  insertTravelParties,
  insertUsers,
  insertWorldEventLog,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { emitWorldEvent, listWorldEvents, tradeRouteKey, } from "./events";
import { runTradeTick, } from "./trade";
import { discoveryDb, TRADE_ROUTE, } from "./types";

let db: Kysely<DB>;

/** Literal ids so every dedupe-key expectation below is checkable. */
const WORLD_ID = "world-trade";
const OTHER_WORLD_ID = "world-trade-other";
const LOC_A = "loc-trade-a";
const LOC_B = "loc-trade-b";
const LOC_C = "loc-trade-c";
const PARTY_A = "party-a";
const PARTY_B = "party-b";
const NPC_ID = "npc-trade";
const MIGRATION_ID = "mig-trade-1";

/** Fixed instant for the seeded `trade_history` rows. Not an input to the
 *  tick — `runTradeTick` takes no clock. */
const NOW = "2027-01-01 00:00:00";

beforeEach(async () => {
  ({ db, } = await createTestDb());
},);

afterEach(async () => {
  await db.destroy();
},);

/** Two worlds, three locations, one NPC. Trade reads travel + log only. */
async function makeWorld(): Promise<void> {
  const ownerId = "user-trade-owner";
  await insertUsers(db, "trade-owner", "Owner", { id: ownerId, },);
  await insertWorlds(db, ownerId, "Trade World", { id: WORLD_ID, },);
  await insertWorlds(db, ownerId, "Trade Other", { id: OTHER_WORLD_ID, },);
  await insertLocations(db, WORLD_ID, "A", { id: LOC_A, },);
  await insertLocations(db, WORLD_ID, "B", { id: LOC_B, },);
  await insertLocations(db, WORLD_ID, "C", { id: LOC_C, },);
  await insertActors(db, "Trader", { id: NPC_ID, actor_type: "character", agent_type: "npc", },);
  await insertNpcStates(db, NPC_ID, WORLD_ID, { location_id: LOC_A, },);
}

/** A convoy part-way along its route, `status: traveling`. */
async function movingParty(id: string, opts: { routeIndex?: number } = {},): Promise<void> {
  await insertTravelParties(db, WORLD_ID, `Party ${id}`, {
    id,
    route: JSON.stringify([LOC_A, LOC_B, LOC_C,],),
    route_index: opts.routeIndex ?? 0,
    steps_per_tick: 1,
    current_location_id: LOC_A,
    status: "traveling",
  },);
}

/** Every `trade:route` row this world logged, oldest tick first. */
async function readTradeEvents() {
  return discoveryDb(db,)
    .selectFrom("world_event_log",)
    .select(["subject_id", "actor_id", "tick_index", "dedupe_key", "payload",],)
    .where("world_id", "=", WORLD_ID,)
    .where("event_type", "=", TRADE_ROUTE,)
    .orderBy("tick_index", "asc",)
    .execute();
}

describe("runTradeTick — convoys in motion", () => {
  test("a traveling party with a route in motion emits trade:route", async () => {
    await makeWorld();
    await movingParty(PARTY_A,);

    expect(await runTradeTick(db, WORLD_ID, 5,),).toEqual({ convoys: 1, events: 1, },);

    const events = await readTradeEvents();
    expect(events,).toHaveLength(1,);
    expect(events[0]?.subject_id,).toBe(PARTY_A,);
    expect(events[0]?.tick_index,).toBe(5,);
    expect(events[0]?.dedupe_key,).toBe(`trade-route:${WORLD_ID}:5:${PARTY_A}`,);

    // The payload reports observed state: where it came from, the head of
    // route ahead, and the world's realised trade volume (0 here — the
    // schema has no per-party ledger, so the count is a world figure).
    expect(JSON.parse(events[0]?.payload ?? "null",),).toEqual({
      source: "party",
      from: LOC_A,
      to: LOC_B,
      route_index: 0,
      trades_recorded: 0,
    },);
  });

  test("the world's realised trade volume rides along on the event", async () => {
    await makeWorld();
    await movingParty(PARTY_A,);
    await insertTradeHistory(db, WORLD_ID, NPC_ID, PARTY_A, NOW, { id: "th-1", },);
    await insertTradeHistory(db, WORLD_ID, NPC_ID, PARTY_A, NOW, { id: "th-2", },);
    // A trade in ANOTHER world must not be counted here.
    await insertTradeHistory(db, OTHER_WORLD_ID, NPC_ID, PARTY_A, NOW, { id: "th-3", },);

    await runTradeTick(db, WORLD_ID, 1,);
    const payload = JSON.parse((await readTradeEvents())[0]?.payload ?? "null",);
    expect(payload.trades_recorded,).toBe(2,);
  });

  test("the same convoy fires again on a later tick but never twice within one", async () => {
    await makeWorld();
    await movingParty(PARTY_A,);

    // Tick 5 lands one event. Re-running tick 5 — a replay — lands none,
    // because the key carries the tick.
    expect(await runTradeTick(db, WORLD_ID, 5,),).toEqual({ convoys: 1, events: 1, },);
    expect(await runTradeTick(db, WORLD_ID, 5,),).toEqual({ convoys: 1, events: 0, },);
    expect(await readTradeEvents(),).toHaveLength(1,);

    // Tick 6 is a different tick, so the same convoy in motion is a
    // different event. This is what makes the tick part of the key.
    expect(await runTradeTick(db, WORLD_ID, 6,),).toEqual({ convoys: 1, events: 1, },);
    const events = await readTradeEvents();
    expect(events.map((e,) => e.dedupe_key),).toEqual([
      `trade-route:${WORLD_ID}:5:${PARTY_A}`,
      `trade-route:${WORLD_ID}:6:${PARTY_A}`,
    ],);

    expect(events.map((e,) => e.tick_index),).toEqual([5, 6,],);
  });

  test("two convoys on one tick each fire their own event", async () => {
    await makeWorld();
    await movingParty(PARTY_A,);
    await movingParty(PARTY_B,);

    expect(await runTradeTick(db, WORLD_ID, 3,),).toEqual({ convoys: 2, events: 2, },);
    // Order-independent on purpose: `world_event_log.id` is
    // `lower(hex(randomblob(16)))` and `listWorldEvents` tie-breaks on it, so
    // two events on one tick come back in arbitrary order. The contract is
    // that BOTH fired, not which one sorts first.
    expect((await readTradeEvents()).map((e,) => e.subject_id).toSorted(),)
      .toEqual([PARTY_A, PARTY_B,].toSorted(),);
  });

  test("an in-transit migration is a convoy of one, subject-namespaced", async () => {
    await makeWorld();
    await insertNpcMigrations(db, WORLD_ID, NPC_ID, 0, 10, {
      id: MIGRATION_ID,
      origin_location_id: LOC_A,
      destination_location_id: LOC_B,
      status: "in_transit",
    },);

    expect(await runTradeTick(db, WORLD_ID, 2,),).toEqual({ convoys: 1, events: 1, },);
    const events = await readTradeEvents();
    // Namespaced so a party id can never collide with a migration subject.
    expect(events[0]?.subject_id,).toBe(`actor:${MIGRATION_ID}`,);
    // A migration ROW id is not an actor id; the actor is a separate column.
    expect(events[0]?.actor_id,).toBe(NPC_ID,);
    expect(JSON.parse(events[0]?.payload ?? "null",),).toEqual({
      source: "migration",
      from: LOC_A,
      to: LOC_B,
      route_index: null,
      trades_recorded: 0,
    },);
  });

  test("a planned migration is not yet a convoy", async () => {
    await makeWorld();
    await insertNpcMigrations(db, WORLD_ID, NPC_ID, 10, 20, {
      id: MIGRATION_ID,
      origin_location_id: LOC_A,
      destination_location_id: LOC_B,
      status: "planned",
    },);

    expect(await runTradeTick(db, WORLD_ID, 5,),).toEqual({ convoys: 0, events: 0, },);
    expect(await readTradeEvents(),).toHaveLength(0,);
  });

  test("a resting or disbanded party emits nothing", async () => {
    await makeWorld();
    await insertTravelParties(db, WORLD_ID, "Resting", {
      id: PARTY_A,
      route: JSON.stringify([LOC_A, LOC_B,],),
      route_index: 1,
      current_location_id: LOC_B,
      status: "resting",
    },);

    await insertTravelParties(db, WORLD_ID, "Disbanded", {
      id: PARTY_B,
      route: JSON.stringify([LOC_A, LOC_B,],),
      route_index: 0,
      current_location_id: LOC_A,
      status: "disbanded",
    },);

    // Only `traveling` means on the road. A resting party has ARRIVED and a
    // disbanded one no longer exists; neither is a convoy in motion.
    expect(await runTradeTick(db, WORLD_ID, 4,),).toEqual({ convoys: 0, events: 0, },);
    expect(await readTradeEvents(),).toHaveLength(0,);
  });

  test("a party's unreadable route still reports its position rather than failing the tick", async () => {
    await makeWorld();
    await insertTravelParties(db, WORLD_ID, "Corrupt", {
      id: PARTY_A,
      route: "not json at all",
      route_index: 0,
      current_location_id: LOC_A,
      status: "traveling",
    },);

    // A data bug must not fail the world tick — the convoy reports where it
    // is and admits it has no readable head of route.
    expect(await runTradeTick(db, WORLD_ID, 1,),).toEqual({ convoys: 1, events: 1, },);
    const payload = JSON.parse((await readTradeEvents())[0]?.payload ?? "null",);
    expect(payload.from,).toBe(LOC_A,);
    expect(payload.to,).toBeNull();
  });

  test("a route that parses to a non-array reports no destination either", async () => {
    await makeWorld();
    await insertTravelParties(db, WORLD_ID, "Object route", {
      id: PARTY_A,
      route: "{}",
      route_index: 0,
      current_location_id: LOC_A,
      status: "traveling",
    },);

    expect(await runTradeTick(db, WORLD_ID, 1,),).toEqual({ convoys: 1, events: 1, },);
    expect(JSON.parse((await readTradeEvents())[0]?.payload ?? "null",).to,).toBeNull();
  });

  test("another world's convoys never appear in this world's log", async () => {
    await makeWorld();
    await insertTravelParties(db, OTHER_WORLD_ID, "Foreign", {
      id: "party-foreign",
      route: JSON.stringify([LOC_A, LOC_B,],),
      route_index: 0,
      current_location_id: LOC_A,
      status: "traveling",
    },);

    await movingParty(PARTY_A,);

    // Both worlds have a moving convoy; only this world's is reported here,
    // and the foreign key never collides with this world's because the key
    // carries the world id.
    expect(await runTradeTick(db, WORLD_ID, 7,),).toEqual({ convoys: 1, events: 1, },);
    const events = await readTradeEvents();
    expect(events,).toHaveLength(1,);
    expect(events[0]?.subject_id,).toBe(PARTY_A,);

    // Running the OTHER world on the same tick adds a second, separate row —
    // same tick index, same subject shape, different world.
    expect(await runTradeTick(db, OTHER_WORLD_ID, 7,),).toEqual({ convoys: 1, events: 1, },);
    const all = await discoveryDb(db,)
      .selectFrom("world_event_log",)
      .select(["world_id", "subject_id",],)
      .orderBy("world_id", "asc",)
      .execute();

    // Two rows, same tick index, one per world — the world id is part of the
    // dedupe key, so neither displaced the other.
    expect(all,).toEqual([
      { world_id: WORLD_ID, subject_id: PARTY_A, },
      { world_id: OTHER_WORLD_ID, subject_id: "party-foreign", },
    ],);
  });
});

describe("emitWorldEvent — the storage-layer idempotency", () => {
  test("a fresh key appends and returns true; the same key returns false and appends nothing", async () => {
    await makeWorld();
    const event = {
      worldId: WORLD_ID,
      eventType: TRADE_ROUTE,
      subjectId: PARTY_A,
      actorId: null,
      tick: 1,
      payload: { hello: "world", },
      dedupeKey: tradeRouteKey(WORLD_ID, 1, PARTY_A,),
    };

    expect(await emitWorldEvent(discoveryDb(db,), event,),).toBe(true,);
    expect(await emitWorldEvent(discoveryDb(db,), event,),).toBe(false,);
    expect(await emitWorldEvent(discoveryDb(db,), event,),).toBe(false,);

    const rows = await discoveryDb(db,)
      .selectFrom("world_event_log",)
      .select(["event_type", "subject_id", "tick_index", "payload",],)
      .execute();

    expect(rows,).toEqual([{
      event_type: TRADE_ROUTE,
      subject_id: PARTY_A,
      tick_index: 1,
      payload: JSON.stringify({ hello: "world", },),
    },],);
  });

  test("different subjects and different ticks are different events", async () => {
    await makeWorld();
    const log = discoveryDb(db,);
    const base = { worldId: WORLD_ID, eventType: TRADE_ROUTE, subjectId: null, actorId: null, payload: {}, };

    expect(
      await emitWorldEvent(log, {
        ...base,
        subjectId: PARTY_A,
        tick: 1,
        dedupeKey: tradeRouteKey(WORLD_ID, 1, PARTY_A,),
      },),
    ).toBe(true,);

    expect(
      await emitWorldEvent(log, {
        ...base,
        subjectId: PARTY_B,
        tick: 1,
        dedupeKey: tradeRouteKey(WORLD_ID, 1, PARTY_B,),
      },),
    ).toBe(true,);

    expect(
      await emitWorldEvent(log, {
        ...base,
        subjectId: PARTY_A,
        tick: 2,
        dedupeKey: tradeRouteKey(WORLD_ID, 2, PARTY_A,),
      },),
    ).toBe(true,);

    expect(await log.selectFrom("world_event_log",).selectAll().execute(),).toHaveLength(3,);
  });
});

describe("listWorldEvents — the admin listing", () => {
  /**
   * Three events in this world — two on tick 9, one on tick 8 — plus one in
   * another world. The two tick-9 rows are the interesting pair: `tick_index`
   * alone does not order them, so the listing's `id ASC` tie-break is what
   * keeps them from swapping between pages or between runs.
   */
  async function seedLog(): Promise<void> {
    await insertWorldEventLog(db, WORLD_ID, TRADE_ROUTE, 9, "k-9-a", { id: "ev-a", subject_id: "s-a", },);
    await insertWorldEventLog(db, WORLD_ID, "location:discovered", 9, "k-9-b", { id: "ev-b", subject_id: "s-b", },);
    await insertWorldEventLog(db, WORLD_ID, TRADE_ROUTE, 8, "k-8-a", { id: "ev-c", subject_id: "s-c", },);
    await discoveryDb(db,)
      .insertInto("world_event_log",)
      .values({
        id: "ev-d",
        world_id: OTHER_WORLD_ID,
        event_type: TRADE_ROUTE,
        subject_id: "s-d",
        tick_index: 9,
        dedupe_key: "k-other",
      },)
      .execute();
  }

  test("orders newest tick first and breaks ties on id, so a tick's events never swap", async () => {
    await makeWorld();
    await seedLog();

    const page = await listWorldEvents(discoveryDb(db,), { worldId: WORLD_ID, page: 1, pageSize: 10, },);
    // `tick_index DESC, id ASC`: the two tick-9 rows first in id order, then
    // tick 8. The other world's row is filtered out entirely.
    expect(page.data.map((r,) => r.subject_id),).toEqual(["s-a", "s-b", "s-c",],);
    expect(page.total,).toBe(3,);
    expect(page.page,).toBe(1,);
    expect(page.pageSize,).toBe(10,);
  });

  test("filters by event type and still counts only the matching rows", async () => {
    await makeWorld();
    await seedLog();

    const page = await listWorldEvents(discoveryDb(db,), {
      worldId: WORLD_ID,
      eventType: TRADE_ROUTE,
      page: 1,
      pageSize: 10,
    },);

    expect(page.data.map((r,) => r.subject_id),).toEqual(["s-a", "s-c",],);
    expect(page.total,).toBe(2,);
  });

  test("pages through the log without dropping or repeating a row", async () => {
    await makeWorld();
    await seedLog();

    const first = await listWorldEvents(discoveryDb(db,), { worldId: WORLD_ID, page: 1, pageSize: 2, },);
    const second = await listWorldEvents(discoveryDb(db,), { worldId: WORLD_ID, page: 2, pageSize: 2, },);
    expect(first.data.map((r,) => r.subject_id),).toEqual(["s-a", "s-b",],);
    expect(second.data.map((r,) => r.subject_id),).toEqual(["s-c",],);
    // `total` is the whole filtered count, not the page size.
    expect(first.total,).toBe(3,);
    expect(second.total,).toBe(3,);
  });

  test("clamps a nonsensical page and page size instead of failing", async () => {
    await makeWorld();
    await seedLog();

    // page 0 would offset backwards off the front of an id-ordered set, and
    // pageSize 0 would be an unbounded read. Both clamp to a usable value.
    const clamped = await listWorldEvents(discoveryDb(db,), { worldId: WORLD_ID, page: 0, pageSize: 0, },);
    expect(clamped.page,).toBe(1,);
    expect(clamped.pageSize,).toBe(1,);
    expect(clamped.data.map((r,) => r.subject_id),).toEqual(["s-a",],);
    expect(clamped.total,).toBe(3,);

    const farPast = await listWorldEvents(discoveryDb(db,), { worldId: WORLD_ID, page: 99, pageSize: 10, },);
    expect(farPast.data,).toEqual([],);
    expect(farPast.total,).toBe(3,);
  });
});
