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
