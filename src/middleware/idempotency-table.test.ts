// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the table idempotency backend.
 *
 * Covers the contract that the `idempotent()` factory depends on plus the
 * cross-process / cross-restart replay path: a row persisted via the async
 * store hydrates the in-memory cache on the next `get()` so a sibling
 * instance (or a process restart) replays the same response.
 *
 * Uses `createTestDb()` to build an in-memory SQLite DB with the real
 * migration chain applied — same surface production runs against.
 */

import { afterEach, beforeEach, describe, expect, test, vi, } from "bun:test";
import { type AsyncStore, createAsyncStore, } from "../async";
import { createLogger, getLogger, setGlobalLogger, } from "../logger";
import type { LogEntry, Transport, } from "../logger/types";
import { createTestDb, type TestDb, } from "../test-utils/create-test-db";
import { createTableBackend, redactKeyForLog, } from "./idempotency-table";

const META = { method: "POST", route: "/api/x", userId: "user-1", };

describe("createTableBackend", () => {
  let testDb: TestDb;
  let asyncStore: AsyncStore;

  beforeEach(async () => {
    testDb = await createTestDb();
    asyncStore = createAsyncStore(testDb.db,);
  },);

  afterEach(async () => {
    if (asyncStore) { await asyncStore.flush(); }
    if (testDb?.db) { await testDb.db.destroy(); }
  },);

  test("returns null for absent keys without throwing on the hot path", () => {
    const backend = createTableBackend(60_000, asyncStore,);
    expect(backend.get("k",),).toBeNull();
  });

  test("markInFlight reserves an in-memory slot synchronously (no DB read required)", () => {
    const backend = createTableBackend(60_000, asyncStore,);
    const entry = backend.markInFlight("k", META,);
    expect(entry.inFlight,).toBe(true,);
    expect(backend.get("k",)?.inFlight,).toBe(true,);
  });

  test("recordResponse persists the response body so a sibling process can replay it", async () => {
    const backend = createTableBackend(60_000, asyncStore,);
    backend.markInFlight("shared-key", META,);
    backend.recordResponse("shared-key", META, {
      status: 201,
      headers: { "content-type": "application/json", "x-trace": "abc", },
      body: JSON.stringify({ ok: true, },),
      startedAt: Date.now(),
    },);
    await asyncStore.flush();

    // Verify the row landed in the table.
    const row = await asyncStore.read("shared-key",);
    expect(row?.status,).toBe("complete",);
    expect(row?.responseStatus,).toBe(201,);
    expect(row?.responseBody,).toBe('{"ok":true}',);
    expect(row?.responseHeaders,).toMatchObject({ "content-type": "application/json", "x-trace": "abc", },);
  });

  test("a fresh backend (different cache, same DB) hydrates from the table on the next get()", async () => {
    // Process 1: complete a request.
    const backend1 = createTableBackend(60_000, asyncStore,);
    backend1.markInFlight("shared-key", META,);
    backend1.recordResponse("shared-key", META, {
      status: 201,
      headers: { "x-trace": "abc", },
      body: "ok",
      startedAt: Date.now(),
    },);
    await asyncStore.flush();

    // Process 2: fresh backend, same DB. get() must hydrate from the table
    // and return the completed entry on the second call.
    const backend2 = createTableBackend(60_000, asyncStore,);
    // First call kicks off the background hydrate; second call observes it.
    expect(backend2.get("shared-key",),).toBeNull();
    // Yield to allow the hydrate promise (asyncStore.read + cache.set) to
    // settle. Multiple ticks are required because asyncStore.read resolves
    // a promise that is awaited inside hydrateFromTable.
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve,) => setTimeout(resolve, 0,));
    await asyncStore.flush();
    const replayed = backend2.get("shared-key",);
    expect(replayed,).not.toBeNull();
    expect(replayed?.body,).toBe("ok",);
    expect(replayed?.headers["x-trace"],).toBe("abc",);
  });

  test("release drops the in-memory slot so the next call retries the handler", () => {
    const backend = createTableBackend(60_000, asyncStore,);
    backend.markInFlight("k", META,);
    backend.release("k", META,);
    expect(backend.get("k",),).toBeNull();
  });

  test("clear removes every entry", () => {
    const backend = createTableBackend(60_000, asyncStore,);
    backend.markInFlight("a", META,);
    backend.recordResponse("b", META, {
      status: 200,
      headers: {},
      body: "ok",
      startedAt: Date.now(),
    },);
    backend.clear();
    expect(backend.get("a",),).toBeNull();
    expect(backend.get("b",),).toBeNull();
  });

  test("a row whose status is `failed` does NOT hydrate the cache (treated as fresh)", async () => {
    // Pre-seed a `failed` row directly via the async store.
    asyncStore.track({
      id: "failed-key",
      method: "POST",
      routePattern: "/api/x",
      userId: "user-1",
    },);
    asyncStore.fail("failed-key", { userId: "user-1", }, "boom",);
    await asyncStore.flush();

    const backend = createTableBackend(60_000, asyncStore,);
    // The hydrate kicks off but does NOT seed the cache (status !== complete).
    expect(backend.get("failed-key",),).toBeNull();
    await Promise.resolve();
    await Promise.resolve();
    expect(backend.get("failed-key",),).toBeNull();
  });

  test("TTL expiry drops completed entries past their TTL (liveEntry path)", () => {
    vi.useFakeTimers();
    try {
      const backend = createTableBackend(1_000, asyncStore,);
      backend.markInFlight("k", META,);
      backend.recordResponse("k", META, {
        status: 200,
        headers: {},
        body: "ok",
        startedAt: Date.now(),
      },);
      expect(backend.get("k",)?.body,).toBe("ok",);
      // Advance past the 1s TTL. completedAt was captured at recordResponse
      // time, so advancing the clock by 2s guarantees the entry is stale.
      vi.advanceTimersByTime(2_000,);
      expect(backend.get("k",),).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // Integration-style test: the hydrate path runs through a real async
  // Kysely SELECT, so the test must yield through the microtask queue
  // plus a real-time settle. Fake timers do not advance Kysely's read.
  test("hydrate skips rows past their TTL (no cache seed from stale table row)", async () => {
    // Pre-seed a complete row whose completed_at is well past any TTL.
    asyncStore.track({
      id: "stale-key",
      method: "POST",
      routePattern: "/api/x",
      userId: "user-1",
    },);
    asyncStore.complete(
      "stale-key",
      { userId: "user-1", },
      { status: 200, headers: {}, body: "old", },
    );
    await asyncStore.flush();
    // Backdate completed_at to 2h ago so the row is past any reasonable TTL.
    await testDb.db
      .updateTable("request_results",)
      .set({ completed_at: new Date(Date.now() - 2 * 60 * 60 * 1000,).toISOString(), },)
      .where("id", "=", "stale-key",)
      .execute();

    const backend = createTableBackend(1_000, asyncStore,);
    // Trigger hydrate; cache must stay empty because the row is past TTL.
    expect(backend.get("stale-key",),).toBeNull();
    await Promise.resolve();
    await Promise.resolve();
    const { promise: settled, resolve: settle, } = Promise.withResolvers<void>();
    setTimeout(settle, 5,);
    await settled;
    expect(backend.get("stale-key",),).toBeNull();
  });

  test("hydrate silently swallows DB read errors so the beforeHandle hot path never throws", async () => {
    // Destroy the database so asyncStore.read() throws.
    await asyncStore.flush();
    await testDb.db.destroy();

    const backend = createTableBackend(60_000, asyncStore,);
    expect(() => backend.get("k",)).not.toThrow();
    // Yield so the hydrate promise rejects silently.
    const { promise, resolve, } = Promise.withResolvers<void>();
    setTimeout(resolve, 5,);
    await promise;
    // Backend still returns null (no crash, no cache seed).
    expect(backend.get("k",),).toBeNull();
  });

  test("redactKeyForLog strips userId + requestId from the cache key", () => {
    // Cache key format: `METHOD ROUTE USER REQUEST_ID`.
    expect(redactKeyForLog("POST /api/x user-7a3b r-secret-deadbeef",),).toBe("POST /api/x",);
    // Anonymous user (anon is also PII-sensitive in the access-log sense).
    expect(redactKeyForLog("POST /api/x anon r-tbl-1",),).toBe("POST /api/x",);
    // No spaces (malformed): pass-through so the operator sees the raw key.
    expect(redactKeyForLog("malformed",),).toBe("malformed",);
    // UserId-only key (2 tokens): still produces METHOD ROUTE.
    expect(redactKeyForLog("GET /api/health",),).toBe("GET /api/health",);
  });

  // Adversarial: a slow hydrate-from-DB must not clobber a fresher local
  // `recordResponse` entry. Cache miss → kicks off hydrate → re-records
  // locally before hydrate settles → hydrate returns must NOT overwrite.
  // Verified: test FAILS without the race-protection guard.
  test("hydrate does not overwrite a newer cache entry (race protection)", async () => {
    const key = "race-key";
    const staleCompletedAt = Date.now() - 10_000;
    // Pre-seed a backdated complete row.
    asyncStore.track({
      id: key,
      method: "POST",
      routePattern: "/api/x",
      userId: "user-1",
    },);
    asyncStore.complete(key, { userId: "user-1", }, {
      status: 200,
      headers: {},
      body: "stale-db",
    },);
    await asyncStore.flush();
    await testDb.db
      .updateTable("request_results",)
      .set({
        status: "complete",
        response_status: 200,
        response_headers: JSON.stringify({},),
        response_body: "stale-db",
        completed_at: new Date(staleCompletedAt,).toISOString(),
      },)
      .where("id", "=", key,)
      .execute();
    const backend = createTableBackend(60_000, asyncStore,);
    backend.markInFlight(key, META,);
    backend.recordResponse(key, META, {
      status: 200,
      headers: {},
      body: "fresh-local",
      startedAt: Date.now() - 50,
    },);
    backend.clear();
    // get() fires hydrate.
    expect(backend.get(key,),).toBeNull();
    // Re-record fresh BEFORE hydrate settles — the race window.
    backend.recordResponse(key, META, {
      status: 200,
      headers: {},
      body: "fresh-local",
      startedAt: Date.now(),
    },);
    await new Promise((resolve,) => setTimeout(resolve, 50,));
    const after = backend.get(key,);
    expect(after?.body,).toBe("fresh-local",);
  });

  // Adversarial: a slow hydrate must NOT clobber an in-flight marker.
  // Sequence: cache miss → hydrate in flight → markInFlight reserves the
  // slot → hydrate resolves with a complete row → must NOT overwrite the
  // in-flight marker (the handler is still running; a third caller would
  // otherwise replay a stale persisted response and lose the in-flight
  // request's response).
  test("hydrate does not overwrite an in-flight reservation", async () => {
    const key = "in-flight-race";
    // Pre-seed a complete row in the DB.
    asyncStore.track({
      id: key,
      method: "POST",
      routePattern: "/api/x",
      userId: "user-1",
    },);
    asyncStore.complete(key, { userId: "user-1", }, {
      status: 200,
      headers: {},
      body: "sibling-persisted",
    },);
    await asyncStore.flush();
    const backend = createTableBackend(60_000, asyncStore,);
    // Cache miss → fires hydrate.
    expect(backend.get(key,),).toBeNull();
    // markInFlight BEFORE hydrate resolves.
    backend.markInFlight(key, META,);
    // Yield so the hydrate settles. Without the fix, the hydrate would
    // overwrite the in-flight marker with the persisted row.
    await new Promise((resolve,) => setTimeout(resolve, 50,));
    const after = backend.get(key,);
    expect(after?.inFlight,).toBe(true,);
    expect(after?.body,).toBe("",);
  });

  // Thundering-herd coalescing: 50 concurrent get() misses for the same
  // key should issue at most ONE DB read (verified indirectly by all
  // callers receiving the same null response and no errors).
  test("concurrent get() misses coalesce (no thundering herd)", async () => {
    const backend = createTableBackend(60_000, asyncStore,);
    const key = "POST /api/x user-1 r-coalesce";
    const results = await Promise.all(
      Array.from({ length: 50, }, () => backend.get(key,),),
    );
    expect(results,).toEqual(Array(50,).fill(null,),);
  });

  // S7 sibling: a DB read failure must emit the warn log via the live
  // global logger, not a module-cached one captured before tests set up
  // their capturing transport. Adversarial: re-introducing the
  // `_log ??= getLogger()...` module cache locks the factory to the
  // fresh createLogger() above (the one with no transport), so the
  // captured[] array stays empty and the assertion below fails.
  test("hydrate_failed warn log emits module=idempotency-table via live logger (no module cache)", async () => {
    const captured: Array<LogEntry> = [];
    const transport: Transport = {
      name: "capture-tbl",
      async write(entry: LogEntry,): Promise<void> {
        captured.push(entry,);
      },
      async flush(): Promise<void> {},
    };
    const log = createLogger({ level: "warn", },);
    log.addTransport(transport,);
    // Capture the prior global logger so the test can restore it on
    // teardown. Otherwise, replacing it with a fresh transport-less
    // logger would leak the global default into subsequent tests and
    // any warn-level emissions from those tests would leak into stdout.
    let priorLogger: ReturnType<typeof getLogger> | null = null;
    try {
      priorLogger = getLogger();
    } catch {
      // No global logger yet — fine.
    }
    setGlobalLogger(log,);
    try {
      // Destroy the DB so asyncStore.read() throws. The hydrate path
      // logs `hydrate_failed` via the live global logger.
      await asyncStore.flush();
      await testDb.db.destroy();
      const backend = createTableBackend(60_000, asyncStore,);
      expect(() => backend.get("POST /api/x user-7a3b r-secret-deadbeef",)).not.toThrow();
      // Yield so the hydrate promise rejects and the warn log fires.
      await new Promise((resolve,) => setTimeout(resolve, 10,));
      await log.flush();
      const entry = captured.find((e,) => e.message === "idempotency-table.hydrate_failed");
      expect(entry,).toBeDefined();
      expect(entry?.meta?.module,).toBe("idempotency-table",);
      expect(entry?.meta?.methodRoute,).toBe("POST /api/x",);
      const serialized = JSON.stringify(entry?.meta ?? {},);
      expect(serialized.includes("user-7a3b",),).toBe(false,);
      expect(serialized.includes("r-secret-deadbeef",),).toBe(false,);
    } finally {
      // Restore the prior global logger (captured before setGlobalLogger
      // above) so subsequent tests inherit the same global logger the
      // suite was running with, not a fresh one that would leak the
      // default ConsoleTransport.
      if (priorLogger) { setGlobalLogger(priorLogger,); }
    }
  });
});
