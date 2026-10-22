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
import { insertActors, insertChatParticipants, insertChats, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { v1Routes, } from "./index";

import type { AsyncStore, } from "../../async/store";

/** */
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

/**
 * @param db
 * @param userId
 */
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

    await insertActors(db, "Test User", { id: userId as never, user_id: userId as never, owner_id: userId as never, },);
    // A public chat exists, so the null-id pin below is non-vacuous: the
    // empty list proves the gate, not an empty table.
    const seededPublic = await insertChats(db, "Seeded Public", userId, { visibility: "public", },);
    await insertChatParticipants(db, seededPublic, userId,);
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

  test("GET /api/v1/chats without userId returns 200 with no chats (no role, no public arm)", async () => {
    const app = createV1App(db, null,);
    const res = await app.handle(new Request("http://localhost/api/v1/chats",),);
    // No requireUserId on the list route since the guest tier (Phase 2): a
    // null id with a null role matches no arm (the public arm needs the
    // guest role), so this answers an empty list — not a 401. A real
    // guest carries userRole `guest` and sees public chats.
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data,).toEqual([],);
  });

  // A barrel that swallowed unknown /api/v1/* paths would let a typo'd or
  // unversioned client call succeed as a no-op instead of 404ing.
  test("GET /api/v1/<unknown> is 404 — the barrel is not a catch-all", async () => {
    const app = createV1App(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/v1/definitely-not-a-route",),);
    expect(res.status,).toBe(404,);
  });

  test("GET /api/v1/users/me returns 200 (userId flows through v1 barrel)", async () => {
    const app = createV1App(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/v1/users/me",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.meta,).toBeDefined();
  });
});
