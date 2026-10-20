// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World conditions route tests — GET conditions, GET history, POST advance.
 * Covers success round-trips, unknown-world 404s, and bad-input 400s.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import type { HandleOpts, } from "./types";
import { worldConditionsRoutes, } from "./world-conditions-routes";

const WORLD_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "user-owner";

let db: Kysely<DB>;
let app: Elysia;

beforeAll(async () => {
  ({ db, } = await createTestDb());
  await insertUsers(db, "owner", "Owner", { id: OWNER_ID, },);
  await insertWorlds(db, OWNER_ID, "Test World", { id: WORLD_ID, },);
  app = new Elysia({ name: "test-conditions-routes", },)
    .derive(() => ({ userId: OWNER_ID, userRole: "owner", }))
    .use(worldConditionsRoutes({ database: db, config: {} as Config, } as HandleOpts,),) as unknown as Elysia;
},);

afterAll(async () => {
  await db.destroy();
},);

describe("world conditions routes", () => {
  test("GET /conditions returns the current snapshot", async () => {
    const res = await app.handle(new Request(`http://localhost/api/worlds/${WORLD_ID}/conditions`,),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: { worldId: string; day: number } };
    expect(body.data.worldId,).toBe(WORLD_ID,);
    expect(body.data.day,).toBe(1,);
  });

  test("GET /conditions returns 404 for an unknown world", async () => {
    const res = await app.handle(new Request("http://localhost/api/worlds/nope/conditions",),);
    expect(res.status,).toBe(404,);
  });

  test("GET /conditions/history returns a list", async () => {
    const res = await app.handle(new Request(`http://localhost/api/worlds/${WORLD_ID}/conditions/history`,),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: unknown[] };
    expect(Array.isArray(body.data,),).toBe(true,);
  });

  test("GET /conditions/history rejects an invalid limit", async () => {
    const res = await app.handle(new Request(`http://localhost/api/worlds/${WORLD_ID}/conditions/history?limit=0`,),);
    expect(res.status,).toBe(422,);
  });

  test("POST /conditions/advance advances the world clock", async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${WORLD_ID}/conditions/advance`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ worldMinutes: 60, },),
      },),
    );

    expect(res.status,).toBe(201,);
    const body = await res.json() as { data: { worldMinute: number } };
    expect(body.data.worldMinute,).toBe(60,);
  });

  test("POST /conditions/advance returns 404 for an unknown world", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/worlds/nope/conditions/advance", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ worldMinutes: 60, },),
      },),
    );

    expect(res.status,).toBe(404,);
  });

  test("POST /conditions/advance rejects negative worldMinutes", async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${WORLD_ID}/conditions/advance`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ worldMinutes: -1, },),
      },),
    );

    expect(res.status,).toBe(422,);
  });
});
