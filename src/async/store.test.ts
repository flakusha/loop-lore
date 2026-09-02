// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { type AsyncStore, createAsyncStore, } from "./store";

describe("AsyncStore", () => {
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

  test("track registers a pending row, read returns it", async () => {
    store.track({ id: "req-1", method: "POST", routePattern: "/api/x", userId: "u-1", },);
    await store.flush();
    const row = await store.read("req-1",);
    expect(row,).not.toBeNull();
    expect(row?.id,).toBe("req-1",);
    expect(row?.method,).toBe("POST",);
    expect(row?.routePattern,).toBe("/api/x",);
    expect(row?.userId,).toBe("u-1",);
    expect(row?.status,).toBe("pending",);
    expect(row?.responseBody,).toBeNull();
  });

  test("progress updates the inlined JSON column", async () => {
    store.track({ id: "req-2", method: "POST", routePattern: "/api/y", userId: null, },);
    store.progress("req-2", { userId: null, }, { progress: { step: "tokens", tokens: 42, }, },);
    await store.flush();
    const row = await store.read("req-2",);
    expect(row?.status,).toBe("in_progress",);
    expect(row?.progress,).toEqual({ step: "tokens", tokens: 42, },);
  });

  test("complete captures status + headers + body", async () => {
    store.track({ id: "req-3", method: "POST", routePattern: "/api/z", userId: null, },);
    store.complete("req-3", { userId: null, }, {
      status: 201,
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ id: "msg-99", },),
    },);
    await store.flush();
    const row = await store.read("req-3",);
    expect(row?.status,).toBe("complete",);
    expect(row?.responseStatus,).toBe(201,);
    expect(row?.responseHeaders,).toEqual({ "Content-Type": "application/json", },);
    expect(row?.responseBody,).toBe(JSON.stringify({ id: "msg-99", },),);
    expect(row?.completedAt,).not.toBeNull();
  });

  test("fail marks the row as failed and surfaces the error", async () => {
    store.track({ id: "req-4", method: "POST", routePattern: "/api/a", userId: null, },);
    store.fail("req-4", { userId: null, }, "boom",);
    await store.flush();
    const row = await store.read("req-4",);
    expect(row?.status,).toBe("failed",);
    expect(row?.error,).toBe("boom",);
  });

  test("complete scoped to owner — cross-user complete is silently dropped", async () => {
    // Alice tracks. Bob attempts to complete Alice's row. The WHERE clause
    // user_id = 'bob' matches zero rows, so the DB row keeps its `pending`
    // state. BUG-bug-async-lifecycle-writes-request-results-unscoped-by-user.
    store.track({ id: "req-5", method: "POST", routePattern: "/api/b", userId: "alice", },);
    store.complete("req-5", { userId: "bob", }, {
      status: 200,
      headers: {},
      body: "bob-forbidden",
    },);
    await store.flush();
    const row = await store.read("req-5",);
    expect(row?.status,).toBe("pending",);
    expect(row?.responseBody,).toBeNull();
  });

  test("fail scoped to owner — cross-user fail is silently dropped", async () => {
    // Same as complete: a fail write for another user's requestId is a no-op.
    store.track({ id: "req-6", method: "POST", routePattern: "/api/c", userId: "alice", },);
    store.fail("req-6", { userId: "bob", }, "bob-forbidden",);
    await store.flush();
    const row = await store.read("req-6",);
    expect(row?.status,).toBe("pending",);
    expect(row?.error,).toBeNull();
  });

  test("read returns null for unknown ids", async () => {
    expect(await store.read("missing",),).toBeNull();
  });
});
