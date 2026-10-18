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
import { GatheringNodeType, NodeInstanceState, WorldVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertGatheringNodeDefs,
  insertGatheringNodeInstances,
  insertLocations,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { resourceRoutes, } from "./resource-routes";

const W1 = "w1";
const W2 = "w2";
const USER_A = "user-a";

let db: Kysely<DB>;
const locationW1 = "loc-w1";
const locationW2 = "loc-w2";

/** Mount the real routes behind a session identity, as the app wires them. */
function appFor(userId: string,): Elysia {
  return new Elysia()
    .derive({ as: "scoped", }, () => ({ userId, userRole: "user", }),)
    .use(resourceRoutes({ database: db, config: {} as Config, },),) as unknown as Elysia;
}

/** A JSON POST to a resource path, authenticated as `userId`. */
function post(userId: string, path: string, body: Record<string, unknown>,): Promise<Response> {
  return appFor(userId,).handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

/** Insert one depleted, respawn-elapsed node in `worldId` and return its id. */
async function depletedNode(worldId: string, locationId: string, id: string,): Promise<string> {
  const def = await insertGatheringNodeDefs(
    db,
    worldId,
    "Iron Vein",
    GatheringNodeType.OreVein,
    new Date().toISOString(),
    new Date().toISOString(),
    { respawn_time_seconds: 60, },
  );

  await insertGatheringNodeInstances(
    db,
    def,
    worldId,
    0,
    new Date().toISOString(),
    new Date().toISOString(),
    {
      id,
      location_id: locationId,
      state: NodeInstanceState.Depleted,
      respawn_at: new Date(Date.now() - 1000,).toISOString(),
      remaining_amount: 0,
    },
  );

  return id;
}

beforeEach(async () => {
  ({ db, } = await createTestDb());

  await insertUsers(db, "Alice", "Alice", { id: USER_A, },);
  // w1 owned by USER_A (the owner gate); w2 public but with no nodes of its own
  // at setup — the test seeds its own.
  await insertWorlds(db, USER_A, "World One", { id: W1, visibility: WorldVisibility.Public, },);
  await insertWorlds(db, USER_A, "World Two", { id: W2, visibility: WorldVisibility.Public, },);
  await insertLocations(db, W1, "Mine", { id: locationW1, },);
  await insertLocations(db, W2, "Quarry", { id: locationW2, },);
},);

afterEach(async () => {
  await db.destroy();
},);

describe("regenerate is scoped to the world in the path", () => {
  test("a node in another world is not swept", async () => {
    const w1Node = await depletedNode(W1, locationW1, "node-w1",);
    const w2Node = await depletedNode(W2, locationW2, "node-w2",);

    const res = await post(USER_A, `/api/worlds/${W1}/resources/regenerate`, {},);
    expect(res.status,).toBe(200,);

    // w1's node was restored.
    const w1Row = await db.selectFrom("gathering_node_instances",).select("state",).where("id", "=", w1Node,)
      .executeTakeFirst();

    expect(w1Row?.state,).toBe(NodeInstanceState.Available,);

    // w2's node was NOT touched.
    const w2Row = await db.selectFrom("gathering_node_instances",).select("state",).where("id", "=", w2Node,)
      .executeTakeFirst();

    expect(w2Row?.state,).toBe(NodeInstanceState.Depleted,);
  });
});

describe("abilityBonus is a bounded client input", () => {
  test("a bonus above MAX_ABILITY_BONUS is rejected by the schema", async () => {
    const def = await insertGatheringNodeDefs(
      db,
      W1,
      "Rich Vein",
      GatheringNodeType.OreVein,
      new Date().toISOString(),
      new Date().toISOString(),
      { respawn_time_seconds: 60, },
    );

    await insertGatheringNodeInstances(
      db,
      def,
      W1,
      1,
      new Date().toISOString(),
      new Date().toISOString(),
      { location_id: locationW1, state: NodeInstanceState.Available, remaining_amount: 5, extraction_difficulty: 60, },
    );

    const body = { locationId: locationW1, nodeInstanceId: def, abilityBonus: 1000, };
    const res = await post(USER_A, `/api/worlds/${W1}/resources/extract`, body,);

    expect(res.status,).toBe(422,);
  });
});
