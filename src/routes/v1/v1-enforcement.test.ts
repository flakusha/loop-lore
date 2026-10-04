/**
 * V1 API enforcement test.
 *
 * Proves the REAL composed app (createApp: registerPlugins + v1 barrel +
 * catch-all) no longer serves barrel-covered resources at unversioned
 * /api/* — those requests must get the 308 version redirect — while the
 * intentionally unversioned infra/federation surfaces (health, agency,
 * views) still answer directly.
 *
 * Resource contract (parallel-safe): each run gets its own in-memory
 * SQLite via createTestDb (no shared paths, ports, or tmp dirs — the app
 * is exercised via app.handle(), never Bun.serve); the cron scheduler is
 * disabled; config is loadConfig()-derived but read-only; no ordering
 * dependence.
 */
import { beforeAll, describe, expect, test, } from "bun:test";
import type { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { loadConfig, } from "../../config/load";
import type { DB, } from "../../db/schema";
import { createApp, } from "../../elysia-app";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { uid, } from "../../utils";

import type { AsyncStore, } from "../../async/store";

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

describe("v1 API enforcement (unversioned /api/* must redirect)", () => {
  let db: Kysely<DB>;
  let app: Elysia;
  const userId = uid();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await db.insertInto("users",).values({
      id: userId,
      username: `user-${userId}`,
      display_name: "Enforcement Test",
      role: "user",
      status: "active",
      settings: "{}",
    },).execute();

    const config = loadConfig();
    config.cron.enabled = false;
    app = createApp({
      database: db,
      config,
      asyncStore: stubAsyncStore(),
    } as never,) as unknown as Elysia;
  },);

  test("analytics (barrel-covered) answers 308 → /api/v1/analytics/overview when unversioned", async () => {
    const res = await app.handle(new Request("http://localhost/api/analytics/overview",),);
    expect(res.status,).toBe(308,);
    expect(res.headers.get("location",),).toBe("/api/v1/analytics/overview",);
  });

  test("auth (barrel-covered) answers 308 when unversioned", async () => {
    const res = await app.handle(new Request("http://localhost/api/auth/me",),);
    expect(res.status,).toBe(308,);
    expect(res.headers.get("location",),).toBe("/api/v1/auth/me",);
  });

  test("already-versioned /api/v1/* is never redirected", async () => {
    const res = await app.handle(new Request("http://localhost/api/v1/health",),);
    expect(res.status,).toBe(200,);
  });

  test("agency stays intentionally unversioned (bare mount, not in barrel)", async () => {
    const agency = await app.handle(new Request("http://localhost/api/agency/balance",),);
    expect(agency.status,).not.toBe(308,);
  });

  test("/api/views/* stays unversioned (not redirected)", async () => {
    const res = await app.handle(new Request("http://localhost/api/views/no-such-view",),);
    expect(res.status,).not.toBe(308,);
  });
});
