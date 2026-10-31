// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression tests for plugin dispatch in `src/server/handler.ts`.
 *
 * The `/api/v1` strip-prefix fallback is retired: versioned `/api/v1/*`
 * requests are served ONLY by the v1 barrel, and unmatched versioned paths
 * 404. Plugin routes keep their own versioned paths and pass through the
 * same governance guard (per-user rate limit + request metrics) and
 * deprecation-header envelope as v1-barrel routes. Pinned here:
 * - a versioned plugin path dispatches directly (no fallback hop);
 * - an unmatched `/api/v1/*` path 404s instead of falling back;
 * - the governance limiter is charged exactly once per request;
 * - the assistant-facing card-battle tool copy names the URL that resolves.
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

/** Registered with its versioned path — the shape plugin routes keep. */
const VERSIONED_PATH = "/api/v1/handler-fixture/thing";
/** POST route of the same plugin (own path, so the two never share a key). */
const POST_PATH = "/api/v1/handler-fixture/post";

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
      path: VERSIONED_PATH,
      handler: async () => {
        calls.push("versioned",);
        return new Response("versioned",);
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

describe("plugin route resolution", () => {
  test("a versioned plugin path dispatches directly", async () => {
    const res = await app.handle(new Request("http://localhost/api/v1/handler-fixture/thing",),);

    expect(res.status,).toBe(200,);
    expect(await res.text(),).toBe("versioned",);
  });

  test("an unmatched versioned path 404s (no strip-prefix fallback)", async () => {
    const res = await app.handle(new Request("http://localhost/api/v1/handler-fixture/nope",),);

    expect(res.status,).toBe(404,);
  });

  test("dispatch preserves the request body when it is still readable", async () => {
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

describe("governance charging", () => {
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
