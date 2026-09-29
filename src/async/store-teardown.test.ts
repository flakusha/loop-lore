// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Teardown-ordering coverage for the async store.
 *
 * The store is fire-and-forget, so any shutdown path that destroys the DB
 * handle before draining the queue strands writes in flight (and, under the
 * browser harness, logged `async-store write failed` against a closed
 * database). These tests pin the contract every shutdown path now relies on:
 * once `flushActiveStore()` resolves, the queue is drained and the DB handle
 * may be destroyed on the very next statement.
 *
 * BUG-browser-teardown-destroys-the-db-before-flushing-the-async-s
 */

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { createTestDb, } from "../test-utils/create-test-db";
import { createAsyncStore, } from "./store";
import { flushActiveStore, setStore, } from "./store-registry";

describe("flushActiveStore", () => {
  beforeEach(() => {
    setStore(null,);
  },);

  afterEach(() => {
    setStore(null,);
  },);

  test("resolves when no store is registered — a no-op, not a throw", async () => {
    await expect(flushActiveStore(),).resolves.toBeUndefined();
  });

  test("persists a queued write, so destroying the DB afterwards loses nothing", async () => {
    const { db, sqlite, } = await createTestDb();
    const store = createAsyncStore(db,);
    setStore(store,);

    // Fire-and-forget, exactly as `recordLifecycle` writes in the request path.
    store.track({ id: "req-teardown", method: "POST", routePattern: "/api/x", userId: "u-1", },);

    // Shutdown contract: quiesce, THEN tear down.
    await flushActiveStore();

    // Read through the raw handle rather than the Kysely instance so the
    // assertion is independent of the flush path under test.
    const row = sqlite
      .query("SELECT id, status FROM request_results WHERE id = ?",)
      .get("req-teardown",) as { id: string; status: string } | null;
    expect(row?.id,).toBe("req-teardown",);
    expect(row?.status,).toBe("pending",);

    await db.destroy();
  });

  test("drains a deep queue fully — a partial flush would strand the tail", async () => {
    const { db, sqlite, } = await createTestDb();
    const store = createAsyncStore(db,);
    setStore(store,);

    const ids = Array.from({ length: 25, }, (_, i,) => `req-${i}`,);
    for (const id of ids) {
      store.track({ id, method: "GET", routePattern: "/api/y", userId: null, },);
    }

    await flushActiveStore();

    const persisted = sqlite
      .query("SELECT COUNT(*) AS n FROM request_results WHERE id LIKE 'req-%'",)
      .get() as { n: number };
    expect(persisted.n,).toBe(ids.length,);

    await db.destroy();
  });

  test("concurrent flushes still quiesce — the re-entrant guard must not drop writes", async () => {
    const { db, sqlite, } = await createTestDb();
    const store = createAsyncStore(db,);
    setStore(store,);

    for (let i = 0; i < 25; i++) {
      store.track({ id: `req-c${i}`, method: "GET", routePattern: "/api/z", userId: null, },);
    }

    await Promise.all([flushActiveStore(), flushActiveStore(),],);

    const persisted = sqlite
      .query("SELECT COUNT(*) AS n FROM request_results WHERE id LIKE 'req-c%'",)
      .get() as { n: number };
    expect(persisted.n,).toBe(25,);

    await db.destroy();
  });
});
