/**
 * V1 API versioning integration test.
 *
 * Proves that `.derive()` context (userId, userRole) propagates through
 * the v1 barrel into route handlers — the original blocker that `.mount()`
 * couldn't solve.
 */
import { beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { uid, } from "../../utils";
import { v1Routes, } from "./index";

import type { AsyncStore, } from "../../async/store";

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

function createV1App(db: Kysely<DB>, userId: string | null,): Elysia {
  const t = (k: string,) => k;
  return new Elysia({ name: "test-v1", },)
    .derive(() => ({ userId, userRole: userId ? "admin" : null, sessionId: null, locale: "en", t, }))
    .use(v1Routes({ database: db, config: {} as any, asyncStore: stubAsyncStore(), },),) as unknown as Elysia;
}

describe("v1 API versioning", () => {
  let db: Kysely<DB>;
  const userId = uid();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    await db.insertInto("users",).values({
      id: userId,
      username: `user-${userId}`,
      display_name: "Test User",
      role: "admin",
      status: "active",
      settings: "{}",
    },).execute();
  },);

  test("GET /api/v1/health returns 200 with meta.api_version", async () => {
    const app = createV1App(db, null,);
    const res = await app.handle(new Request("http://localhost/api/v1/health",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.meta,).toBeDefined();
    expect((body.meta as Record<string, unknown>).api_version,).toBe("1",);
  });

  test("GET /api/v1/chats returns 200 (userId flows through v1 barrel)", async () => {
    const app = createV1App(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/v1/chats",),);
    // If context propagation fails, this would be 401 (userId === null)
    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.meta,).toBeDefined();
    expect((body.meta as Record<string, unknown>).api_version,).toBe("1",);
  });

  test("GET /api/v1/chats without userId returns 401", async () => {
    const app = createV1App(db, null,);
    const res = await app.handle(new Request("http://localhost/api/v1/chats",),);
    // Auth guard should reject — userId is null
    expect(res.status,).toBe(401,);
  });

  test("GET /api/v1/users/me returns 200 (userId flows through v1 barrel)", async () => {
    const app = createV1App(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/v1/users/me",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.meta,).toBeDefined();
  });
});
