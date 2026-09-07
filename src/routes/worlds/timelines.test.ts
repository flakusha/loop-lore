// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression tests for BUG-world-timelines-unauthenticated-read-and-create.
 *
 * The three unprotected handlers (GET list, POST create, GET by id) MUST
 * reject unauthenticated callers with 401. The DELETE handler already had
 * the guard — we still cover it for parity.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertUsers,
  insertWorlds,
  insertWorldTimelines,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { timelinesRoutes, } from "./timelines";
import type { HandleOpts, } from "./types";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const BASE = "http://localhost";

/**
 * @param db
 * @param userId
 * @param userRole
 */
function appWithAuth(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-worlds-timelines", },)
    .derive(() => ({ userId, userRole, }))
    .use(timelinesRoutes({ database: db, config: {} as Config, } as HandleOpts,),) as unknown as Elysia;
}

/**
 * @param path
 */
function get(path: string,): Request {
  return new Request(`${BASE}${path}`,);
}

/**
 * @param path
 * @param body
 */
async function postJson(path: string, body: unknown,): Promise<Request> {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

/**
 * @param app
 * @param req
 */
async function appHandle(app: Elysia, req: Request,): Promise<Response> {
  return (app as unknown as { handle: (r: Request,) => Promise<Response> }).handle(req,);
}

describe("timelinesRoutes — auth guards (BUG-world-timelines-unauthenticated)", () => {
  let db: Kysely<DB>;
  let sqlite: TestDb["sqlite"];
  let ownerId: string;
  let outsiderId: string;
  let worldId: string;
  let primeTimelineId: string;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());

    ownerId = uid();
    outsiderId = uid();

    await insertUsers(db, "owner", "Owner", { id: ownerId, } as never,);
    await insertUsers(db, "outsider", "Outsider", { id: outsiderId, } as never,);

    for (const id of [ownerId, outsiderId,]) {
      await insertActors(db, id, {
        id,
        actor_type: "user",
        user_id: id,
        owner_id: id,
        agent_type: "none",
        settings: "{}",
        format_version: 0,
      } as never,);
    }

    // World is private (default visibility), so only the owner is visible.
    await insertWorlds(db, ownerId, "Private Realm", {},);
    const w = await db
      .selectFrom("worlds",)
      .select("id",)
      .where("owner_id", "=", ownerId,)
      .executeTakeFirst();
    if (!w) { throw new Error("seed: world not inserted",); }
    worldId = w.id;

    await insertWorldTimelines(db, worldId, "Prime", { is_prime: 1, },);
    const tl = await db
      .selectFrom("world_timelines",)
      .select("id",)
      .where("world_id", "=", worldId,)
      .where("name", "=", "Prime",)
      .executeTakeFirst();
    if (!tl) { throw new Error("seed: timeline not inserted",); }
    primeTimelineId = tl.id;
  },);

  afterAll(async () => {
    await sqlite.close();
  },);

  test("GET /worlds/:worldId/timelines rejects unauthenticated with 401", async () => {
    const app = appWithAuth(db, null, null,);
    const res = await appHandle(app, get(`/api/worlds/${worldId}/timelines`,),);
    expect(res.status,).toBe(401,);
  });

  test("POST /worlds/:worldId/timelines rejects unauthenticated with 401", async () => {
    const app = appWithAuth(db, null, null,);
    const res = await appHandle(
      app,
      await postJson(`/api/worlds/${worldId}/timelines`, { name: "alt-branch", },),
    );
    expect(res.status,).toBe(401,);
    // Confirm no row was inserted.
    const row = await db
      .selectFrom("world_timelines",)
      .select("id",)
      .where("name", "=", "alt-branch",)
      .executeTakeFirst();
    expect(row,).toBeUndefined();
  });

  test("GET /worlds/:worldId/timelines/:timelineId rejects unauthenticated with 401", async () => {
    const app = appWithAuth(db, null, null,);
    const res = await appHandle(
      app,
      get(`/api/worlds/${worldId}/timelines/${primeTimelineId}`,),
    );
    expect(res.status,).toBe(401,);
  });

  test("GET list returns the owner's data", async () => {
    const app = appWithAuth(db, ownerId, "user",);
    const res = await appHandle(app, get(`/api/worlds/${worldId}/timelines`,),);
    expect(res.status,).toBe(201,);
    const body = (await res.json()) as { data: { id: string; name: string }[] };
    expect(body.data,).toHaveLength(1,);
    expect(body.data[0]?.id,).toBe(primeTimelineId,);
  });

  test("GET list denies a non-member of a private world (404 to hide existence)", async () => {
    const app = appWithAuth(db, outsiderId, "user",);
    const res = await appHandle(app, get(`/api/worlds/${worldId}/timelines`,),);
    expect(res.status,).toBe(404,);
  });

  test("POST create rejects a non-owner (403)", async () => {
    const app = appWithAuth(db, outsiderId, "user",);
    const res = await appHandle(
      app,
      await postJson(`/api/worlds/${worldId}/timelines`, { name: "stranger-branch", },),
    );
    expect(res.status,).toBe(403,);
  });

  test("POST create as owner succeeds (201)", async () => {
    const app = appWithAuth(db, ownerId, "user",);
    const res = await appHandle(
      app,
      await postJson(`/api/worlds/${worldId}/timelines`, { name: "owner-branch", },),
    );
    expect(res.status,).toBe(201,);
    const body = (await res.json()) as { data: { id: string; name: string; is_prime: number } };
    expect(body.data.name,).toBe("owner-branch",);
    expect(body.data.is_prime,).toBe(0,);
  });

  test("DELETE rejects non-owner (403), unauthenticated (401), succeeds for owner (204)", async () => {
    // First seed a non-prime branch to delete.
    await insertWorldTimelines(db, worldId, "scratch-branch", { is_prime: 0, },);
    const branch = await db
      .selectFrom("world_timelines",)
      .select("id",)
      .where("name", "=", "scratch-branch",)
      .executeTakeFirst();
    expect(branch,).toBeTruthy();

    // Non-owner: 403.
    const outsiderApp = appWithAuth(db, outsiderId, "user",);
    const forbidden = await appHandle(
      outsiderApp,
      new Request(`${BASE}/api/worlds/${worldId}/timelines/${branch!.id}`, { method: "DELETE", },),
    );
    expect(forbidden.status,).toBe(403,);

    // Unauthenticated: 401.
    const anonApp = appWithAuth(db, null, null,);
    const unauth = await appHandle(
      anonApp,
      new Request(`${BASE}/api/worlds/${worldId}/timelines/${branch!.id}`, { method: "DELETE", },),
    );
    expect(unauth.status,).toBe(401,);

    // Owner: 204 + row gone.
    const ownerApp = appWithAuth(db, ownerId, "user",);
    const deleted = await appHandle(
      ownerApp,
      new Request(`${BASE}/api/worlds/${worldId}/timelines/${branch!.id}`, { method: "DELETE", },),
    );
    expect(deleted.status,).toBe(204,);

    const after = await db
      .selectFrom("world_timelines",)
      .select("id",)
      .where("id", "=", branch!.id,)
      .executeTakeFirst();
    expect(after,).toBeUndefined();
  });
});
