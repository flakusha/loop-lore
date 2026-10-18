// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * End-to-end proof that Elysia identity reaches plugin dispatch.
 *
 * `route-access.test.ts` covers the enforcement rules but starts at
 * `dispatchPluginRoute`, so it cannot catch a wiring break between the auth
 * derive and the plugin dispatcher. This exercises the REAL `createApp` + REAL
 * `handleApiRequest`, because the thing under test is exactly that seam: the
 * derive resolves identity without rejecting, and the catch-all must hand it on.
 *
 * Requests use the `/api/v1/*` prefix because the catch-all 308-redirects any
 * unversioned `/api/*`; `handleApiRequest` then strips the prefix on its second
 * dispatch hop — the hop that must also carry the caller.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { flushActiveStore, } from "../async/store-registry";
import { loadConfig, } from "../config/load";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { createApp, } from "../elysia-app";
import { registry, } from "./index";
import { handleApiRequest, } from "../server";
import { createTestDb, } from "../test-utils/create-test-db";

/** Registered by the fixture below; the v1 hop strips the `/api/v1` prefix. */
const SECRET_PATH = "/plugin-wiring/secret";
/** Same shape, no access fields — must stay public. */
const OPEN_PATH = "/plugin-wiring/open";

let db: Kysely<DB>;
let config: Config;
let app: ReturnType<typeof createApp>;
let calls = 0;

beforeAll(async () => {
  ({ db, } = await createTestDb());
  config = loadConfig();
  config.assets.uploadDir = ".tmp/";

  registry.register({
    manifest: { name: "wiring-fixture", version: "1", description: "d", author: "t", },
    origin: "local",
    directory: "test",
  },);

  registry.addRoutes("wiring-fixture", [
    {
      method: "GET",
      path: SECRET_PATH,
      handler: async () => { calls += 1; return new Response("secret",); },
      requiresAuth: true,
    },
    {
      method: "GET",
      path: OPEN_PATH,
      handler: async () => { calls += 1; return new Response("open",); },
    },
  ],);

  app = createApp({
    database: db,
    config,
    handleNonApiRequest: async () => new Response("nf", { status: 404, },),
    handleApiRequest,
  },);
},);

beforeEach(() => {
  calls = 0;
},);

afterAll(async () => {
  await flushActiveStore();
  registry.unregisterAll();
  await db.destroy();
},);

/** GET a plugin route through the full app chain. */
function get(path: string,): Promise<Response> {
  return app.handle(new Request(`http://localhost/api/v1${path}`,),);
}

describe("auth required, no token", () => {
  beforeEach(() => {
    config.auth.required = true;
  },);

  test("requiresAuth plugin route answers 401 and never runs its handler", async () => {
    const res = await get(SECRET_PATH,);
    expect(res.status,).toBe(401,);
    expect(calls,).toBe(0,);
  },);

  test("a route with no access fields is still served (backward compat)", async () => {
    const res = await get(OPEN_PATH,);
    expect(res.status,).toBe(200,);
    expect(await res.text(),).toBe("open");
    expect(calls,).toBe(1,);
  },);
});

describe("authenticated caller (solo mode)", () => {
  beforeEach(() => {
    config.auth.required = false;
  },);

  test("requiresAuth plugin route is served and its handler runs", async () => {
    const res = await get(SECRET_PATH,);
    expect(res.status,).toBe(200,);
    expect(await res.text(),).toBe("secret");
    expect(calls,).toBe(1,);
  },);

  test("the exact identity the derive produced crosses into handleApiRequest", async () => {
    const seen: { userId: string | null; userRole: string | null }[] = [];
    const spyApp = createApp({
      database: db,
      config,
      handleNonApiRequest: async () => new Response("nf", { status: 404, },),
      handleApiRequest: async (opts) => {
        seen.push({ userId: opts.caller?.userId ?? null, userRole: opts.caller?.userRole ?? null, });
        return new Response("ok",);
      },
    },);

    await spyApp.handle(new Request(`http://localhost/api/v1${OPEN_PATH}`,),);

    expect(seen,).toHaveLength(1,);
    const row = await db.selectFrom("users",).select(["id", "role",]).executeTakeFirst();
    expect(seen[0]?.userId,).toBe(row?.id,);
    expect(seen[0]?.userRole,).toBe(row?.role,);
  },);
});

describe("unauthenticated request", () => {
  test("the catch-all forwards a null identity, not undefined or a stale one", async () => {
    config.auth.required = true;
    const seen: unknown[] = [];
    const spyApp = createApp({
      database: db,
      config,
      handleNonApiRequest: async () => new Response("nf", { status: 404, },),
      handleApiRequest: async (opts) => {
        seen.push(opts.caller);
        return new Response("ok",);
      },
    },);

    await spyApp.handle(new Request(`http://localhost/api/v1${OPEN_PATH}`,),);

    expect(seen,).toHaveLength(1,);
    expect(seen[0],).toEqual({ userId: null, userRole: null, },);
  },);
});


/**
 * GET /api/v1/chats/activity is a real, non-plugin route whose first statement
 * is `requireUserId(ctx)` (src/routes/activity.ts). It is the representative
 * consumer of the `userId: null` contract, so it is the one that proves the
 * invariant end to end rather than only at the derive boundary.
 */
const REAL_GUARDED_ROUTE = "/chats/activity";

describe("the userId: null contract reaches real route handlers", () => {
  test("a real route behind requireUserId answers 401 when the derive yields null", async () => {
    config.auth.required = true;

    // No token is sent, so `authenticate` fails and the derive returns
    // userId: null instead of rejecting the request (src/elysia-app.ts).
    const res = await app.handle(
      new Request(`http://localhost/api/v1${REAL_GUARDED_ROUTE}`,),
    );

    expect(res.status,).toBe(401,);
  },);

  test("that 401 body is the unauthorized error, not an empty or chat payload", async () => {
    config.auth.required = true;

    const res = await app.handle(
      new Request(`http://localhost/api/v1${REAL_GUARDED_ROUTE}`,),
    );

    expect(res.status,).toBe(401,);

    // A guard that fell through would answer 200 with a chats array; pin that
    // the body is the error shape and carries no user-scoped data.
    const body = await res.json() as Record<string, unknown>;
    expect(Object.keys(body,),).toContain("error",);
    expect(body["chats"],).toBeUndefined();
  },);

  test("a client-supplied x-user-id cannot stand in for a failed auth", async () => {
    config.auth.required = true;

    // The derive deletes a spoofable x-user-id on the auth-failure path
    // (src/elysia-app.ts) so the spoofed id cannot reach requireUserId.
    const res = await app.handle(new Request(
      `http://localhost/api/v1${REAL_GUARDED_ROUTE}`,
      { headers: { "x-user-id": "forged-user", }, },
    ),);

    expect(res.status,).toBe(401,);
  },);

  test("the same route is served once authentication resolves an identity", async () => {
    // Solo mode authenticates the seeded instance user, so requireUserId
    // returns a string and the handler runs instead of short-circuiting.
    config.auth.required = false;

    const res = await app.handle(
      new Request(`http://localhost/api/v1${REAL_GUARDED_ROUTE}`,),
    );

    // Proves the 401 above comes from the null userId, not from the route
    // being permanently unavailable.
    expect(res.status,).toBe(200,);

    // computeActivity returns a chat-id → ActivityEntry record (not a list).
    const body = await res.json() as { chats: Record<string, unknown> };
    expect(body.chats,).toBeDefined();
    expect(typeof body.chats,).toBe("object",);
  },);
});
