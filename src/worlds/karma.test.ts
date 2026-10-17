// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/karma.test.ts — karma ledger, per-actor faction standing,
 * the exact tier boundaries, and the free-jump gate those tiers feed
 * (migration 062).
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { LocationEdgeError, } from "../locations/edge-core";
import { EdgeTravelService, } from "../locations/edge-travel";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActorCurrencies,
  insertActorLocations,
  insertActors,
  insertLocationEdges,
  insertLocations,
  insertUsers,
  insertWorlds,
} from "../test-utils/insert-helpers";
import { createFaction, } from "./factions";
import { adjustFactionStanding, getFactionStanding, getKarma, recordKarmaEvent, } from "./karma";
import { KarmaTier, StandingTier, } from "./karma-tiers";

let db: Kysely<DB>;

beforeEach(async () => {
  ({ db, } = await createTestDb());
  await insertUsers(db, "owner", "Owner", { id: "user-owner", },);
  await insertWorlds(db, "user-owner", "Test World", { id: "w1", },);
},);

afterEach(async () => {
  await db.destroy();
},);

describe("karma ledger", () => {
  test("events accumulate into overall AND into the named category", async () => {
    const first = await recordKarmaEvent({
      db,
      worldId: "w1",
      actorId: "actor-1",
      category: "honor",
      delta: 10,
      reason: "kept the gate",
    },);

    expect(first.overall,).toBe(10,);
    expect(first.categories,).toEqual({ honor: 10, },);

    const second = await recordKarmaEvent({
      db,
      worldId: "w1",
      actorId: "actor-1",
      category: "honor",
      delta: 5,
    },);

    const third = await recordKarmaEvent({
      db,
      worldId: "w1",
      actorId: "actor-1",
      category: "cruelty",
      delta: -3,
    },);

    expect(third.overall,).toBe(12,);
    expect(third.categories,).toEqual({ honor: 15, cruelty: -3, },);
    expect(second.tier,).toBe("neutral",);

    const events = await db.selectFrom("karma_events",).selectAll().orderBy("occurred_at", "asc",).execute();
    expect(events.length,).toBe(3,);
    expect(events.map((row,) => row.delta),).toEqual([10, 5, -3,],);
    expect(await getKarma(db, "w1", "actor-1",),).toEqual(third,);
  });

  test("scores clamp at the ends of the -100..100 range", async () => {
    const capped = await recordKarmaEvent({
      db,
      worldId: "w1",
      actorId: "actor-2",
      category: "greed",
      delta: 500,
    },);

    expect(capped.overall,).toBe(100,);
    expect(capped.tier,).toBe(KarmaTier.Saint,);
  });
});

describe("faction standing", () => {
  test("unknown pairs read as neutral and adjustments clamp", async () => {
    const faction = await createFaction({ db, worldId: "w1", name: "Ashen Guard", },);
    const before = await getFactionStanding({
      db,
      worldId: "w1",
      actorId: "actor-1",
      factionId: faction.id,
    },);

    expect(before.standing,).toBe(0,);
    expect(before.tier,).toBe(StandingTier.Neutral,);

    const raised = await adjustFactionStanding({
      db,
      worldId: "w1",
      actorId: "actor-1",
      factionId: faction.id,
      delta: 200,
      reason: "carried the banner",
    },);

    expect(raised.standing,).toBe(100,);
    expect(raised.tier,).toBe(StandingTier.Exalted,);

    const rows = await db.selectFrom("faction_standing",).selectAll().execute();
    expect(rows.length,).toBe(1,);
  });

  test("a second adjustment folds into the same row", async () => {
    const faction = await createFaction({ db, worldId: "w1", name: "River Compact", },);
    await adjustFactionStanding({
      db,
      worldId: "w1",
      actorId: "actor-3",
      factionId: faction.id,
      delta: 10,
    },);

    const again = await adjustFactionStanding({
      db,
      worldId: "w1",
      actorId: "actor-3",
      factionId: faction.id,
      delta: 5,
      reason: "second errand",
    },);

    expect(again.standing,).toBe(15,);

    const rows = await db.selectFrom("faction_standing",).selectAll().execute();
    expect(rows.length,).toBe(1,);
    expect(rows[0]?.standing,).toBe(15,);
  });

  test("a free-jump price tag is gated on the actor's standing", async () => {
    const owner = "user-owner";
    const player = "player-1";
    await insertUsers(db, player, "Player", { id: player, },);
    const worldId = await insertWorlds(db, owner, "Gate World", { id: "w2", visibility: "public", },);
    const actorId = await insertActors(db, "actor-gate", { user_id: player, owner_id: player, },);
    const faction = await createFaction({ db, worldId, name: "Ashen Guard", },);
    const a = await insertLocations(db, worldId, "A",);
    const b = await insertLocations(db, worldId, "B",);
    await insertActorLocations(db, a, a, { actor_id: actorId, },);
    await insertActorCurrencies(db, actorId, worldId, "gold", { balance: 10, },);
    await insertLocationEdges(db, worldId, a, b, {
      mode: "free-jump",
      cost_json: JSON.stringify({ requiresFactionStanding: `${faction.id}:honored`, },),
    },);

    const travel = new EdgeTravelService(db,);
    const hop = {
      worldId,
      fromId: a,
      toId: b,
      mode: "free-jump",
      actorId,
      bypassDiscovery: true,
    };

    await expect(travel.travel({ ...hop, },),).rejects.toThrow(/needs honored standing/,);

    await adjustFactionStanding({
      db,
      worldId,
      actorId,
      factionId: faction.id,
      delta: 40,
      reason: "swore the oath",
    },);

    const outcome = await travel.travel({ ...hop, },);
    expect(outcome.toId,).toBe(b,);
    expect(outcome.goldCharged,).toBeNull();
  });

  test("a malformed price tag surfaces as bad-cost, not a server fault", async () => {
    const owner = "user-owner";
    const worldId = await insertWorlds(db, owner, "Tag World", { id: "w4", visibility: "public", },);
    const actorId = await insertActors(db, "actor-tag", { user_id: owner, owner_id: owner, },);
    const a = await insertLocations(db, worldId, "A",);
    const b = await insertLocations(db, worldId, "B",);
    await insertActorLocations(db, a, a, { actor_id: actorId, },);
    await insertLocationEdges(db, worldId, a, b, {
      mode: "free-jump",
      cost_json: JSON.stringify({ requiresFactionStanding: "nonsense", },),
    },);

    const travel = new EdgeTravelService(db,);
    const hop = {
      worldId,
      fromId: a,
      toId: b,
      mode: "free-jump",
      actorId,
      bypassDiscovery: true,
    };

    // The route maps LocationEdgeError only; anything else would surface as
    // a 500 instead of a 400.
    let caught: unknown = null;
    try {
      await travel.travel({ ...hop, },);
    } catch (thrown) {
      caught = thrown;
    }

    if (!(caught instanceof LocationEdgeError)) {
      throw new Error(`expected a LocationEdgeError, got ${String(caught,)}`,);
    }

    expect(caught.code,).toBe("bad-cost",);
  });

  test("an item-only free-jump still needs the party economy", async () => {
    const owner = "user-owner";
    const worldId = await insertWorlds(db, owner, "Item World", { id: "w3", visibility: "public", },);
    const actorId = await insertActors(db, "actor-item", { user_id: owner, owner_id: owner, },);
    const a = await insertLocations(db, worldId, "A",);
    const b = await insertLocations(db, worldId, "B",);
    await insertActorLocations(db, a, a, { actor_id: actorId, },);
    await insertLocationEdges(db, worldId, a, b, {
      mode: "free-jump",
      cost_json: JSON.stringify({ itemId: "warp-seal", },),
    },);

    const travel = new EdgeTravelService(db,);
    let caught: unknown = null;
    try {
      await travel.travel({ worldId, fromId: a, toId: b, mode: "free-jump", actorId, bypassDiscovery: true, },);
    } catch (thrown) {
      caught = thrown;
    }

    if (!(caught instanceof LocationEdgeError)) {
      throw new Error(`expected a LocationEdgeError, got ${String(caught,)}`,);
    }

    expect(caught.code,).toBe("bad-cost",);
  });
});
