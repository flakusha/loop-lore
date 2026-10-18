// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/routes/worlds/karma-routes.test.ts — `:factionId` is scoped to
 * `:worldId` on the faction-standing routes.
 *
 * BUG-karma-standing-skips-faction-in-world-check — both standing routes
 * accepted any `factionId`. `adjustFactionStanding` writes
 * `faction_standing(world_id, faction_id, actor_id)` and the FK only requires
 * that the faction exist SOMEWHERE, so a world owner could attach a standing
 * row for another world's faction into their own world; the GET reported
 * "neutral" for a foreign faction instead of 404ing. The routes now run
 * `requireFactionsInWorld`, the guard faction-routes already used.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertFactions, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { karmaRoutes, } from "./karma-routes";
import type { HandleOpts, } from "./types";

const WORLD = "w1";
const OTHER_WORLD = "w2";
let db: Kysely<DB>;
let ownFaction = "";
let foreignFaction = "";
let ownFaction = "";
let foreignFaction = "";
/** Mount the real karma routes behind a session identity. */
function appFor(userId: string,): Elysia {
  return new Elysia()
    .derive({ as: "scoped", }, () => ({ userId, userRole: "user", }),)
    .use(karmaRoutes({ database: db, config: {} as Config, } as HandleOpts,),) as unknown as Elysia;
}

/** A request authenticated as the world owner. */
function call(method: "GET" | "POST", path: string, body?: Record<string, unknown>,): Promise<Response> {
  return appFor(OWNER,).handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: { "content-type": "application/json", },
      body: body === undefined ? null : JSON.stringify(body,),
    },),
  );
}

/** The standing rows written for a faction in a world. */
async function standingRows(): Promise<unknown[]> {
  return await db
    .selectFrom("faction_standing",)
    .select(["world_id", "faction_id",],)
    .execute();
}
beforeEach(async () => {
  ({ db, } = await createTestDb());

  await insertUsers(db, "owner", "Owner", { id: OWNER, },);
  await insertWorlds(db, OWNER, "Home World", { id: WORLD, },);
  await insertWorlds(db, OWNER, "Other World", { id: OTHER_WORLD, },);
  await insertActors(db, "Actor", { id: ACTOR, },);
  ownFaction = await insertFactions(db, WORLD, "Guild", { id: "faction-own", },);
  foreignFaction = await insertFactions(db, OTHER_WORLD, "Rival Guild", { id: "faction-foreign", },);
},);

afterEach(async () => {
  await db.destroy();
},);

describe("faction standing is scoped to the world", () => {
  test("POSTing standing for another world's faction is a 404 and writes nothing", async () => {
    const res = await call("POST", `/api/worlds/${WORLD}/actors/${ACTOR}/factions/${foreignFaction}/standing`, {
      delta: 10,
      reason: "bribed",
    },);

    expect(res.status,).toBe(404,);
    expect(await standingRows(),).toEqual([],);
  });

  test('GETting standing for another world\'s faction is a 404, not "neutral"', async () => {
    const res = await call("GET", `/api/worlds/${WORLD}/actors/${ACTOR}/factions/${foreignFaction}/standing`,);

    expect(res.status,).toBe(404,);
  });

  test("the world's OWN faction still works on both verbs", async () => {
    const post = await call("POST", `/api/worlds/${WORLD}/actors/${ACTOR}/factions/${ownFaction}/standing`, {
      delta: 10,
    },);

    expect(post.status,).toBe(200,);

    const get = await call("GET", `/api/worlds/${WORLD}/actors/${ACTOR}/factions/${ownFaction}/standing`,);
    expect(get.status,).toBe(200,);
    expect(await get.json(),).toMatchObject({ data: { standing: 10, }, },);
  });
});

describe("the karma profile + event routes answer for the world owner", () => {
  test("GET an actor's karma profile (ensureProfile creates the zero row)", async () => {
    const res = await get(USER_A, `/api/worlds/${W1}/actors/${ACTOR_A}/karma`,);

    expect(res.status,).toBe(200,);

    const body = await res.json() as { data: { overall: number; actor_id: string } };
    expect(body.data.actor_id,).toBe(ACTOR_A,);
    expect(body.data.overall,).toBe(0,);
  });

  test("POST a karma event folds the delta into the profile", async () => {
    const res = await post(USER_A, `/api/worlds/${W1}/actors/${ACTOR_A}/karma/events`, {
      category: "honor",
      delta: 5,
      reason: "held the gate",
    },);

    expect(res.status,).toBe(200,);

    const body = await res.json() as { data: { overall: number } };
    expect(body.data.overall,).toBe(5,);
  });
});

const OWNER = "user-owner";

const WORLD = "w1";

const ACTOR = "actor1";

const OTHER_WORLD = "w2";
