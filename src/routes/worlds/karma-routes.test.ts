// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/routes/worlds/karma-routes.test.ts — the faction id in the standing path
 * must belong to the world in the path.
 *
 * Both standing endpoints gate on the world (`requireWorldOwner` for the write,
 * `requireWorldAccess` for the read) but the faction is addressed by its OWN id:
 * without a faction-in-world scope check a caller who owns ANY world could read
 * or rewrite another world's faction standing by guessing the id.
 *
 * The attack each case reproduces: authenticated as the owner of w1, send a
 * standing GET/POST naming a faction that lives in w2. Before the fix both
 * returned 200; now both return 404.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { WorldVisibility, } from "../../db/enums-story/world";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { createFaction, } from "../../worlds/factions";
import { karmaRoutes, } from "./karma-routes";

const W1 = "w1";
const W2 = "w2";
const USER_A = "user-a";
const USER_B = "user-b";
const ACTOR_A = "actor-a";

let db: Kysely<DB>;
let factionInW1 = "";
let factionInW2 = "";

/** Mount the real routes behind a session identity, as the app wires them. */
function appFor(userId: string,): Elysia {
  return new Elysia()
    .derive({ as: "scoped", }, () => ({ userId, userRole: "user", }),)
    .use(karmaRoutes({ database: db, config: {} as Config, },),) as unknown as Elysia;
}

/** A JSON POST to a karma path, authenticated as `userId`. */
function post(userId: string, path: string, body: Record<string, unknown>,): Promise<Response> {
  return appFor(userId,).handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

/** A GET of a karma path, authenticated as `userId`. */
function get(userId: string, path: string,): Promise<Response> {
  return appFor(userId,).handle(new Request(`http://localhost${path}`,),);
}

beforeEach(async () => {
  ({ db, } = await createTestDb());

  await insertUsers(db, "Alice", "Alice", { id: USER_A, },);
  await insertUsers(db, "Bob", "Bob", { id: USER_B, },);
  // w1 is owned by USER_A (passes the write gate); w2 is public (passes the
  // read gate) but its faction is USER_B's — the faction scope check is what
  // must refuse the cross-world ids below.
  await insertWorlds(db, USER_A, "World One", { id: W1, visibility: WorldVisibility.Public, },);
  await insertWorlds(db, USER_B, "World Two", { id: W2, visibility: WorldVisibility.Public, },);
  await insertActors(db, "Alice Actor", { id: ACTOR_A, user_id: USER_A, },);
  factionInW1 = (await createFaction({ db, worldId: W1, name: "Guard", },)).id;
  factionInW2 = (await createFaction({ db, worldId: W2, name: "Compact", },)).id;
},);

afterEach(async () => {
  await db.destroy();
},);

describe("the standing routes scope the faction id to the path world", () => {
  test("GET standing for another world's faction returns 404", async () => {
    const foreign = await get(USER_A, `/api/worlds/${W1}/actors/${ACTOR_A}/factions/${factionInW2}/standing`,);
    expect(foreign.status,).toBe(404,);

    // Control: the faction that DOES belong to w1 reads fine.
    const own = await get(USER_A, `/api/worlds/${W1}/actors/${ACTOR_A}/factions/${factionInW1}/standing`,);

    expect(own.status,).toBe(200,);
  });

  test("POST standing for another world's faction returns 404", async () => {
    const foreign = await post(
      USER_A,
      `/api/worlds/${W1}/actors/${ACTOR_A}/factions/${factionInW2}/standing`,
      { delta: 10, reason: "cross-world write", },
    );

    expect(foreign.status,).toBe(404,);

    // Control: the same call against w1's own faction succeeds.
    const own = await post(
      USER_A,
      `/api/worlds/${W1}/actors/${ACTOR_A}/factions/${factionInW1}/standing`,
      { delta: 10, reason: "own-world write", },
    );

    expect(own.status,).toBe(200,);
  });
});
