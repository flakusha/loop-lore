// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression tests for the plugin dispatch fallback in `src/server/handler.ts`.
 *
 * - SUR-3: a plugin registers its route with its own `/api` prefix
 *   (`/api/card-battle/start`) while the version redirect consumes one `/api`
 *   segment of the request path, so the versioned URL the assistant is told to
 *   call (`/api/v1/card-battle/start`) answered 404 for EVERY plugin route.
 * - SUR-5: the governance limiter was charged once per dispatch attempt, so
 *   every `/api/v1/*` request consumed two tokens instead of one.
 *
 * Resource contract: the plugin registry is process-wide, so this file
 * registers its `handler-fixture` plugin before every test (a sibling suite may
 * reset the registry between files) and unregisters ONLY its own plugin
 * afterwards (never `unregisterAll`, which would wipe a sibling suite's
 * routes). The limiter probe uses a user id no other test uses, and a fresh
 * one per run, so it never shares a rate-limit window with another file. The
 * tests do not depend on each other's order: every assertion reads the
 * response it just produced.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { readFileSync, } from "node:fs";
import { join, } from "node:path";
import { governanceRateLimiter, } from "../api-governance/rate-limiting/instance";
import { policyForRoute, } from "../api-governance/rate-limiting/policies";
import { loadConfig, } from "../config/load";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { createApp, } from "../elysia-app";
import { registry, } from "../plugins";
import { createTestDb, } from "../test-utils/create-test-db";
import { handleApiRequest, } from "./handler";

/** Registered with its own `/api` prefix — the shape every shipped plugin uses. */
const API_PREFIXED_PATH = "/api/handler-fixture/thing";
/** POST route of the same plugin (own path, so the two never share a key). */
const POST_PATH = "/api/handler-fixture/post";
/** Registered without the prefix — the shape the auth-wiring fixture uses. */
const BARE_PATH = "/handler-fixture/bare";

let db: Kysely<DB>;
let config: Config;
let app: ReturnType<typeof createApp>;
let calls: string[] = [];

/**
 * Register the fixture plugin and its routes.
 *
 * Re-registered before every test: the registry is process-wide and sibling
 * suites reset it, which would otherwise turn these assertions into 404s.
 */
function registerFixture(): void {
  registry.unregister("handler-fixture",);
  registry.register({
    manifest: { name: "handler-fixture", version: "1", description: "d", author: "t", },
    origin: "local",
    directory: "test",
  },);

  registry.addRoutes("handler-fixture", [
    {
      method: "GET",
      path: API_PREFIXED_PATH,
      handler: async () => {
        calls.push("api-prefixed",);
        return new Response("api-prefixed",);
      },
    },
    {
      method: "POST",
      path: POST_PATH,
      handler: async (request,) => {
        const body = await request.text();
        calls.push(`post:${body}`,);
        return new Response("posted",);
      },
    },
    {
      method: "GET",
      path: BARE_PATH,
      handler: async () => {
        calls.push("bare",);
        return new Response("bare",);
      },
    },
  ],);
}

beforeAll(async () => {
  ({ db, } = await createTestDb());
  config = loadConfig();
  config.assets.uploadDir = ".tmp/";
  config.auth.required = false;

  app = createApp({
    database: db,
    config,
    handleNonApiRequest: async () => new Response("nf", { status: 404, },),
    handleApiRequest,
  },);
},);

beforeEach(() => {
  calls = [];
  registerFixture();
},);

afterAll(async () => {
  registry.unregister("handler-fixture",);
  await db.destroy();
},);

describe("plugin route resolution (SUR-3)", () => {
  test("the versioned URL reaches a route registered with its own /api prefix", async () => {
    const res = await app.handle(new Request("http://localhost/api/v1/handler-fixture/thing",),);

    expect(res.status,).toBe(200,);
    expect(await res.text(),).toBe("api-prefixed",);
  });

  test("the double-prefixed versioned URL still resolves", async () => {
    const res = await app.handle(new Request("http://localhost/api/v1/api/handler-fixture/thing",),);

    expect(res.status,).toBe(200,);
    expect(await res.text(),).toBe("api-prefixed",);
  });

  test("a route registered without the /api prefix still resolves", async () => {
    const res = await app.handle(new Request("http://localhost/api/v1/handler-fixture/bare",),);

    expect(res.status,).toBe(200,);
    expect(await res.text(),).toBe("bare",);
  });

  test("the fallback re-dispatches the request body when it is still readable", async () => {
    const res = await handleApiRequest({
      request: new Request("http://localhost/api/v1/handler-fixture/post", {
        method: "POST",
        body: JSON.stringify({ hello: "world", },),
        headers: { "content-type": "application/json", },
      },),
      database: db,
      config,
      caller: { userId: "handler-body-user", userRole: null, },
      governanceEnabled: () => true,
    },);

    expect(res.status,).toBe(200,);
    expect(calls,).toContain('post:{"hello":"world"}',);
  });

  test("the assistant-facing tool message names the URL that resolves", () => {
    const source = readFileSync(
      join(import.meta.dir, "..", "..", "plugins", "core", "card-battle", "plugin.ts",),
      "utf8",
    );

    expect(source,).toContain(
      "use the /api/v1/card-battle/start and /api/v1/card-battle/play endpoints",
    );
  });
});

describe("governance charging (SUR-5)", () => {
  test("a versioned request that matches no route costs exactly one token", async () => {
    const path = "/api/v1/handler-fixture/missing";
    const policy = policyForRoute(path,);
    const userId = `handler-limiter-user-${crypto.randomUUID()}`;
    const key = `${userId}:${policy.name}`;
    const before = governanceRateLimiter.peek(key, policy,).remaining;

    const res = await handleApiRequest({
      request: new Request(`http://localhost${path}`,),
      database: db,
      config,
      caller: { userId, userRole: null, },
      governanceEnabled: () => true,
    },);

    expect(res.status,).toBe(404,);
    expect(before - governanceRateLimiter.peek(key, policy,).remaining,).toBe(1,);
  });
});
