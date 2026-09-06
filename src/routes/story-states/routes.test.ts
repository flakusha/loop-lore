// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story-state route tests — location state, NPC state, NPCs-at-location,
 * and world-state snapshots.
 *
 * Mounts storyStatesRoutes behind the same derive-auth harness as
 * stats.test.ts over a real in-memory DB. Covers success round-trips,
 * Elysia validation failures (422), and not-found paths (404) for
 * missing rows, foreign owners, and unauthenticated callers.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertLocations,
  insertLocationStates,
  insertNpcStates,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { storyStatesRoutes, } from "./index";

const WORLD_ID = "11111111-1111-4111-8111-111111111111";
const LOCATION_ID = "22222222-2222-4222-8222-222222222222";
const NPC_ID = "33333333-3333-4333-8333-333333333333";
const MISSING_ID = "99999999-9999-4999-8999-999999999999";

/**
 * @param db
 * @param userId
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userId?: string, userRole?: string,) {
  const app = new Elysia({ name: "test-story-states", },);
  if (userId) {
    app.derive(() => ({ userId, userRole, }));
  }
  return app.use(storyStatesRoutes({ database: db, },),);
}

/**
 * @param url
 * @param body
 */
function putJson(url: string, body: unknown,): Request {
  return new Request(url, {
    method: "PUT",
    headers: { "content-type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

/**
 * @param url
 * @param body
 */
function postJson(url: string, body: unknown,): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

describe("story-state routes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: "owner" as never, },);
    await insertUsers(db, "stranger", "Stranger", { id: "stranger" as never, },);
    await insertWorlds(db, "owner", "State World", { id: WORLD_ID as never, },);
    await insertLocations(db, WORLD_ID, "Tavern", { id: LOCATION_ID as never, },);
    await insertLocationStates(db, LOCATION_ID, WORLD_ID, { weather: "rainy", },);
    await insertActors(db, "Goblin", { id: NPC_ID as never, },);
    await insertNpcStates(db, NPC_ID, WORLD_ID, { location_id: LOCATION_ID, health: 10, },);
  },);

  afterAll(() => sqlite.close());

  test("GET location state returns the seeded row", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/locations/${LOCATION_ID}/state`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { location_id: string; weather: string };
    expect(body.location_id,).toBe(LOCATION_ID,);
    expect(body.weather,).toBe("rainy",);
  });

  test("PUT location state touches the row and returns it", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      putJson(`http://localhost/api/locations/${LOCATION_ID}/state`, {
        location_id: LOCATION_ID,
        state_key: "weather",
        state_value: "sunny",
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { id: string; location_id: string; updated_at: string };
    expect(body.location_id,).toBe(LOCATION_ID,);
    expect(typeof body.updated_at,).toBe("string",);
  });

  test("PUT location state rejects a missing body (422)", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      putJson(`http://localhost/api/locations/${LOCATION_ID}/state`, {},),
    );
    expect(res.status,).toBe(422,);
  });

  test("GET location state returns 404 for unknown, foreign, and anon callers", async () => {
    const missing = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/locations/${MISSING_ID}/state`,),
    );
    expect(missing.status,).toBe(404,);
    const foreign = await makeApp(db, "stranger", "user",).handle(
      new Request(`http://localhost/api/locations/${LOCATION_ID}/state`,),
    );
    expect(foreign.status,).toBe(404,);
    const anon = await makeApp(db,).handle(
      new Request(`http://localhost/api/locations/${LOCATION_ID}/state`,),
    );
    expect(anon.status,).toBe(404,);
  });

  test("GET NPC state returns the seeded row", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/worlds/${WORLD_ID}/npc-states/${NPC_ID}`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { actor_id: string; world_id: string; health: number };
    expect(body.actor_id,).toBe(NPC_ID,);
    expect(body.world_id,).toBe(WORLD_ID,);
    expect(body.health,).toBe(10,);
  });

  test("PUT NPC state touches the row and returns it", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      putJson(`http://localhost/api/worlds/${WORLD_ID}/npc-states/${NPC_ID}`, {
        npc_id: NPC_ID,
        state_key: "health",
        state_value: 7,
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { actor_id: string; updated_at: string };
    expect(body.actor_id,).toBe(NPC_ID,);
    expect(typeof body.updated_at,).toBe("string",);
  });

  test("PUT NPC state rejects a missing body (422)", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      putJson(`http://localhost/api/worlds/${WORLD_ID}/npc-states/${NPC_ID}`, {},),
    );
    expect(res.status,).toBe(422,);
  });

  test("GET NPC state returns 404 for unknown, foreign, and anon callers", async () => {
    const missing = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/worlds/${WORLD_ID}/npc-states/${MISSING_ID}`,),
    );
    expect(missing.status,).toBe(404,);
    const foreign = await makeApp(db, "stranger", "user",).handle(
      new Request(`http://localhost/api/worlds/${WORLD_ID}/npc-states/${NPC_ID}`,),
    );
    expect(foreign.status,).toBe(404,);
    const anon = await makeApp(db,).handle(
      new Request(`http://localhost/api/worlds/${WORLD_ID}/npc-states/${NPC_ID}`,),
    );
    expect(anon.status,).toBe(404,);
  });

  test("GET NPCs-at-location lists the NPC at the tavern", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/worlds/${WORLD_ID}/npcs-at/${LOCATION_ID}`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { actor_id: string; display_name: string }[];
    expect(body.length,).toBe(1,);
    expect(body[0]!.actor_id,).toBe(NPC_ID,);
    expect(body[0]!.display_name,).toBe("Goblin",);
  });

  test("GET NPCs-at-location returns 404 for unknown worlds and anon callers", async () => {
    const missing = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/worlds/${MISSING_ID}/npcs-at/${LOCATION_ID}`,),
    );
    expect(missing.status,).toBe(404,);
    const anon = await makeApp(db,).handle(
      new Request(`http://localhost/api/worlds/${WORLD_ID}/npcs-at/${LOCATION_ID}`,),
    );
    expect(anon.status,).toBe(404,);
  });

  test("GET world states starts empty, POST creates a snapshot, GET lists it", async () => {
    const authed = makeApp(db, "owner", "user",);
    const empty = await authed.handle(
      new Request(`http://localhost/api/worlds/${WORLD_ID}/states`,),
    );
    expect(empty.status,).toBe(200,);
    const emptyBody = await empty.json() as { data: unknown[]; pagination: { total: number } };
    expect(emptyBody.pagination.total,).toBe(0,);
    expect(emptyBody.data,).toEqual([],);

    const created = await authed.handle(
      postJson(`http://localhost/api/worlds/${WORLD_ID}/states`, { description: "snap-1", },),
    );
    expect(created.status,).toBe(201,);
    const createdBody = await created.json() as { id: string };
    expect(typeof createdBody.id,).toBe("string",);

    const listed = await authed.handle(
      new Request(`http://localhost/api/worlds/${WORLD_ID}/states`,),
    );
    expect(listed.status,).toBe(200,);
    const listedBody = await listed.json() as {
      data: { id: string }[];
      pagination: { total: number };
    };
    expect(listedBody.pagination.total,).toBe(1,);
    expect(listedBody.data[0]!.id,).toBe(createdBody.id,);
  });

  test("world states return 404 for unknown worlds and anon callers", async () => {
    const missing = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/worlds/${MISSING_ID}/states`,),
    );
    expect(missing.status,).toBe(404,);
    const missingPost = await makeApp(db, "owner", "user",).handle(
      postJson(`http://localhost/api/worlds/${MISSING_ID}/states`, { description: "x", },),
    );
    expect(missingPost.status,).toBe(404,);
    const anon = await makeApp(db,).handle(
      new Request(`http://localhost/api/worlds/${WORLD_ID}/states`,),
    );
    expect(anon.status,).toBe(404,);
  });
});
