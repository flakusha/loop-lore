// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { type AsyncStore, createAsyncStore, } from "../../async/store";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { requestStatusRoutes, } from "./status";

function buildApp(
  store: AsyncStore,
  userId: string | null = null,
  userRole: string | null = null,
) {
  return new Elysia({ name: "test-status", },)
    .derive(() => ({ userId, userRole, }))
    .use(requestStatusRoutes({ asyncStore: store, }, "/api",),);
}

describe("GET /api/requests/:id/status", () => {
  let db: Kysely<DB>;
  let store: AsyncStore;

  beforeEach(async () => {
    ({ db, } = await createTestDb());
    store = createAsyncStore(db, { defaultTtlMs: 60_000, },);
  },);

  afterEach(async () => {
    store.destroy();
    await db.destroy();
  },);

  test("404 for an unknown id", async () => {
    const app = buildApp(store,);
    const res = await app.handle(new Request("http://localhost/api/requests/missing/status",),);
    expect(res.status,).toBe(404,);
  });

  test("400 when the id is unsafe", async () => {
    const app = buildApp(store,);
    const res = await app.handle(new Request("http://localhost/api/requests/has%20space/status",),);
    expect([400, 422,],).toContain(res.status,);
  });

  test("returns full payload when the caller owns the row", async () => {
    store.track({ id: "req-owned", method: "POST", routePattern: "/api/x", userId: "alice", },);
    store.complete("req-owned", {
      status: 200,
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ ok: true, },),
    },);
    await store.flush();

    const app = buildApp(store, "alice",);
    const res = await app.handle(new Request("http://localhost/api/requests/req-owned/status",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      requestId: string;
      status: string;
      response: { status: number } | null;
    };
    expect(body.requestId,).toBe("req-owned",);
    expect(body.status,).toBe("complete",);
    expect(body.response?.status,).toBe(200,);
  });

  test("404 when a non-owner queries someone else's row", async () => {
    store.track({ id: "req-other", method: "POST", routePattern: "/api/x", userId: "alice", },);
    await store.flush();
    const app = buildApp(store, "bob",);
    const res = await app.handle(new Request("http://localhost/api/requests/req-other/status",),);
    expect(res.status,).toBe(404,);
  });

  test("admin can read any user's row", async () => {
    store.track({ id: "req-x", method: "POST", routePattern: "/api/x", userId: "alice", },);
    await store.flush();
    const app = buildApp(store, "admin-uid", "admin",);
    const res = await app.handle(new Request("http://localhost/api/requests/req-x/status",),);
    expect(res.status,).toBe(200,);
  });
});
