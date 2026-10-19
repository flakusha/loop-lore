// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/routes/worlds/resource-routes.test.ts — the two route-level invariants
 * the extraction endpoints must not lose:
 *
 * 1. `regenerate` is owner-gated, and the sweep it triggers is scoped to the
 *    world in the path. Before the fix the owner of w1 could restore every
 *    depleted node in w2.
 * 2. `abilityBonus` is a client input on the trust boundary. It is subtracted
 *    from the DC, so an unbounded value clamped every node to difficulty 1 — a
 *    guaranteed success on every roll. The schema bounds it.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertGatheringNodeDefs,
  insertGatheringNodeInstances,
  insertLocations,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { MAX_ABILITY_BONUS, } from "../../worlds/resource-core";
import { resourceRoutes, } from "./resource-routes";

import { ResourceQuality, } from "../../db/enums-story/resources";
import type { HandleOpts, } from "./types";

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * src/routes/worlds/resource-routes.test.ts — the extraction surface's
 * trust boundary.
 *
 * Two defects share this file because both are "the request decides what the
 * server sweeps / how hard the roll is":
 *
 *   BUG-resources-regenerate-global-sweep — `/resources/regenerate` gated one
 *   world's OWNER and then ran an UPDATE with no `world_id` predicate, so it
 *   restored every other world's depleted nodes.
 *
 *   BUG-client-controlled-ability-bonus — `abilityBonus` was an unbounded
 *   client integer subtracted from the DC, which clamps to a floor of 1, so
 *   any value above the node's DC made the extraction a guaranteed success.
 *
 * The routes are mounted for real, with the session identity derived the way
 * the app derives it, so `requireWorldOwner` and the body schema both run.
 */

let db: Kysely<DB>;

/** Fixed base instant, so the sweep's `now` and the seeded respawn never drift. */
const T0 = new Date("2026-03-01T00:00:00.000Z",);

/** Mount the real resource routes behind a session identity. */
function appFor(userId: string, role = "user",): Elysia {
  return new Elysia()
    .derive({ as: "scoped", }, () => ({ userId, userRole: role, }),)
    .use(resourceRoutes({ database: db, config: {} as Config, } as HandleOpts,),) as unknown as Elysia;
}

/** A JSON POST authenticated as `userId`. */
function post(userId: string, path: string, body: Record<string, unknown>,): Promise<Response> {
  return appFor(userId,).handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

/** One depleted node whose respawn window has elapsed, in `worldId`. */
async function seedDepletedNode(worldId: string, locationId: string,): Promise<string> {
  const defId = await insertGatheringNodeDefs(
    db,
    worldId,
    "Iron Vein",
    GatheringNodeType.OreVein,
    STAMP,
    STAMP,
    { respawn_time_seconds: 1, },
  );

  return await insertGatheringNodeInstances(db, defId, worldId, 1, STAMP, STAMP, {
    id: `node-${worldId}`,
    location_id: locationId,
    state: NodeInstanceState.Depleted,
    respawn_at: STAMP,
    quality: ResourceQuality.Common,
    extraction_difficulty: 50,
    remaining_amount: 0,
  },);
}

/** Make the seeded node available again, for the extraction cases. */
async function makeAvailable(worldId: string,): Promise<void> {
  await db
    .updateTable("gathering_node_instances",)
    .set({ state: NodeInstanceState.Available, respawn_at: null, remaining_amount: 5, },)
    .where("id", "=", `node-${worldId}`,)
    .execute();
}

/** The state of one seeded node. */
async function nodeState(worldId: string,): Promise<string> {
  const row = await db
    .selectFrom("gathering_node_instances",)
    .select(["state",],)
    .where("id", "=", `node-${worldId}`,)
    .executeTakeFirstOrThrow();

  return row.state;
}

beforeEach(async () => {
  ({ db, } = await createTestDb());

  await insertUsers(db, "owner", "Owner", { id: OWNER, },);
  await insertWorlds(db, OWNER, "Mine World", { id: "w1", },);
  await insertWorlds(db, OWNER, "Other World", { id: "w2", },);
  await insertLocations(db, "w1", "Mine", { id: "loc1", },);
  await insertLocations(db, "w2", "Other Mine", { id: "loc2", },);
  await insertActors(db, "Owner", { id: OWNER_ACTOR, user_id: OWNER, },);
},);

afterEach(async () => {
  await db.destroy();
},);

describe("POST /resources/regenerate stays inside its world", () => {
  // ── BUG-resources-regenerate-global-sweep ───────────────────
  //
  // The load-bearing assertion is w2's node: before the fix the same request
  // restored it too, because the engine's UPDATE carried no `world_id`
  // predicate behind a per-world owner gate.
  test("the owner's regenerate leaves another world's depleted node depleted", async () => {
    await seedDepletedNode("w1", "loc1",);
    await seedDepletedNode("w2", "loc2",);

    const res = await post(OWNER, "/api/worlds/w1/resources/regenerate", {},);

    expect(res.status,).toBe(200,);
    expect(await res.json(),).toMatchObject({ data: { regenerated: 1, }, },);
    expect(await nodeState("w1",),).toBe(NodeInstanceState.Available,);
    expect(await nodeState("w2",),).toBe(NodeInstanceState.Depleted,);
  });

  test("a member who is not the owner is refused before anything is swept", async () => {
    await insertUsers(db, "member", "Member", { id: "user-member", },);
    await seedDepletedNode("w1", "loc1",);
    await seedDepletedNode("w2", "loc2",);

    const res = await post("user-member", "/api/worlds/w1/resources/regenerate", {},);

    expect(res.status,).toBe(403,);
    expect(await nodeState("w1",),).toBe(NodeInstanceState.Depleted,);
    expect(await nodeState("w2",),).toBe(NodeInstanceState.Depleted,);
  });
});

describe("POST /resources/extract bounds the client abilityBonus", () => {
  // ── BUG-client-controlled-ability-bonus ─────────────────────
  //
  // `abilityBonus: 1000` on a difficulty-50 node clamps the DC to 1, and a
  // d100 is always at or above 1 — a guaranteed success the client bought.
  test("an absurd bonus is rejected by validation", async () => {
    await seedDepletedNode("w1", "loc1",);
    // An AVAILABLE node, so a rejection is unambiguously the schema's doing
    // and not the engine's depleted-node refusal.
    await makeAvailable("w1",);

    const res = await post(OWNER, "/api/worlds/w1/resources/extract", {
      locationId: "loc1",
      nodeInstanceId: "node-w1",
      abilityBonus: 1000,
    },);

    expect(res.status,).toBe(422,);
    expect(await db.selectFrom("extraction_rolls",).select("id",).execute(),).toHaveLength(0,);
  });

  test("a bonus inside the accepted range still rolls", async () => {
    await seedDepletedNode("w1", "loc1",);
    await makeAvailable("w1",);

    const res = await post(OWNER, "/api/worlds/w1/resources/extract", {
      locationId: "loc1",
      nodeInstanceId: "node-w1",
      abilityBonus: 5,
    },);

    expect(res.status,).toBe(200,);
    expect(await db.selectFrom("extraction_rolls",).select("id",).execute(),).toHaveLength(1,);
  });
});

const OWNER = "user-owner";

const OWNER_ACTOR = "actor-owner";

/** Fixed stamp well past every respawn window the fixtures write. */
const STAMP = "2026-03-01T00:00:00.000Z";
