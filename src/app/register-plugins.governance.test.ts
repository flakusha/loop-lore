// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * registerPlugins governance WIRING test (epic-api-governance-perimeter, S-6).
 *
 * The v1 barrel's guard is proven by governance-integration.test.ts, but the
 * migrated modules (story-orchestration, agency, location-explorer, game-state,
 * config-menu) are mounted on the ROOT app in register-plugins.ts — outside
 * the barrel. Before the `governed()` wrapper the guard never ran on them, so
 * the /story/step + /story/resume generation rules could never fire where the
 * guard executes. Every 429 here can ONLY come from that wrapper: this test
 * app has no catch-all, no handler.ts dispatcher, and no other governance
 * application point, and only governance.ts sets `x-ratelimit-hit`.
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

  test("story/step 429s under the generation policy through the real registerPlugins mount (S-6)", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      statuses.push((await app.handle(stepRequest(),)).status,);
    }

    // The route handler answered (404 for the unknown chat — never 429): the
    // surface is mounted AND reachable, so the refusals below are the guard.
    expect(statuses[0],).toBe(404,);
    // generationPolicy: 20/min with burst 5 — request 6 is the first refusal.
    expect(statuses.slice(5,).every((s,) => s === 429),).toBe(true,);
    // Only governance.ts sets this header, and in this app the ONLY governance
    // hook instance is the registerPlugins `governed()` wrapper.
    const throttled = await app.handle(stepRequest(),);
    expect(throttled.status,).toBe(429,);
    expect(throttled.headers.get("x-ratelimit-hit",),).toBe("1",);
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
