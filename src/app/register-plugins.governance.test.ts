// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * registerPlugins governance topology test (epic-api-governance-perimeter, S-6).
 *
 * Nothing versioned mounts here anymore: the five former `migrated-v1`
 * standalones (story-orchestration, agency, location-explorer, game-state,
 * config-menu) moved into the v1 barrel (`standalone-surface.ts`), which owns
 * the governance guard. Pinned here: registerPlugins mounts NO versioned
 * surface, so versioned generation traffic can only be throttled by the
 * barrel guard (proven by governance-integration.test.ts), never by a second
 * root-level guard instance that would double-charge every request.
 *
 * Resource contract (parallel-safe): own `:memory:` SQLite; env owns nothing
 * (predicate injected); `metrics` + `governanceRateLimiter` singletons reset
 * per test, mirroring governance-integration.test.ts.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { governanceRateLimiter, } from "../api-governance/rate-limiting/instance";
import { metrics, } from "../api-governance/telemetry/collector";
import type { AsyncStore, } from "../async/store";
import type { Config, } from "../config/schema";
import { createConfigSchema, } from "../config/schema-class";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { storyOrchestrationRoutes, } from "../routes/story-orchestration";
import { v1Routes, } from "../routes/v1";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { registerPlugins, } from "./register-plugins";

/** Test seam — matches the AsyncStore surface consumed by route plugins. */
function stubAsyncStore(): AsyncStore {
  return {
    track() {},
    progress() {},
    complete() {},
    fail() {},
    config: { maxInlineBytes: 65536, defaultTtlMs: 24 * 60 * 60 * 1000, queueLimit: 10_000, },
    async flush() {},
    async read() {
      return null;
    },

    destroy() {},
  };
}

/** A story-step POST against a chat id that does not exist. */
function stepRequest(): Request {
  return new Request(`http://localhost/api/v1/chats/${uid()}/story/step`, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: JSON.stringify({},),
  },);
}

describe("registerPlugins wires the governance guard onto root-mounted surfaces", () => {
  let db: Kysely<DB>;
  const userId = uid();
  let app: Elysia;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await db.insertInto("users",).values({
      id: userId,
      username: `user-${userId}`,
      display_name: "Register Plugins Governance",
      role: "user",
      status: "active",
      settings: "{}",
    },).execute();

    app = new Elysia({ name: "test-register-plugins-governance", },)
      .derive(() => ({
        userId,
        userRole: "user",
        sessionId: null,
        locale: "en",
        t: (k: string,) => k,
      })) as unknown as Elysia;

    registerPlugins(
      app as unknown as Parameters<typeof registerPlugins>[0],
      // Real schema defaults: several mounted factories (liveness, federation,
      // metrics) read their config section AT REGISTRATION time, so {} would
      // crash the mount. Defaults keep every opt-in surface switched off.
      // Injected predicate — no process.env mutation (see file header).
      {
        database: db,
        config: structuredClone(createConfigSchema().defaults,) as Config,
        asyncStore: stubAsyncStore(),
        governanceEnabled: () => true,
      },
    );
  },);

  afterAll(async () => {
    if (!db) { return; }
    await db.destroy();
  },);

  beforeEach(() => {
    metrics.reset();
  },);

  afterEach(() => {
    governanceRateLimiter.destroy();
  },);

  test("story/step 429s under the generation policy through the v1 barrel (S-6)", async () => {
    // The barrel owns the guard now that the standalones moved into it: the
    // same registerPlugins config object feeds the barrel, so the predicate
    // wiring is still exercised end to end.
    const barrel = new Elysia({ name: "test-barrel-governance", },)
      .derive(() => ({
        userId,
        userRole: "user",
        sessionId: null,
        locale: "en",
        t: (k: string,) => k,
      })) as unknown as Elysia;

    barrel.use(
      v1Routes({
        database: db,
        config: structuredClone(createConfigSchema().defaults,) as Config,
        asyncStore: stubAsyncStore(),
        governanceEnabled: () => true,
      },),
    );

    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      statuses.push((await barrel.handle(stepRequest(),)).status,);
    }

    // The route handler answered (404 for the unknown chat — never 429): the
    // surface is mounted AND reachable, so the refusals below are the guard.
    expect(statuses[0],).toBe(404,);
    // generationPolicy: 20/min with burst 5 — request 6 is the first refusal.
    expect(statuses.slice(5,).every((s,) => s === 429),).toBe(true,);
    // Only governance.ts sets this header, and in this app the ONLY governance
    // hook instance is the barrel guard mounted above.
    const throttled = await barrel.handle(stepRequest(),);
    expect(throttled.status,).toBe(429,);
    expect(throttled.headers.get("x-ratelimit-hit",),).toBe("1",);
  });

  test("registerPlugins mounts no versioned surface (no second guard)", async () => {
    // Double-mounting a versioned module here AND in the barrel would
    // duplicate the routes and defeat the 308 version redirect. A versioned
    // story path through the registerPlugins-only app must therefore 404.
    const res = await app.handle(stepRequest(),);
    expect(res.status,).toBe(404,);
  });

  test("control: the bare story plugin without registerPlugins is never throttled", async () => {
    // Proves the 429s above come from the registerPlugins wiring, not from
    // anything inherent to storyOrchestrationRoutes itself.
    const bare = new Elysia({ name: "test-story-bare-no-guard", },)
      .derive(() => ({ userId, userRole: "user", sessionId: null, locale: "en", t: (k: string,) => k, }))
      .use(
        storyOrchestrationRoutes({
          database: db,
          config: structuredClone(createConfigSchema().defaults,) as Config,
        },),
      ) as unknown as Elysia;

    for (let i = 0; i < 8; i++) {
      const res = await bare.handle(stepRequest(),);
      expect(res.status,).not.toBe(429,);
    }
  });
});
