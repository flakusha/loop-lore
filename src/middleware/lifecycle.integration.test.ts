// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Integration test for the request-lifecycle hook (recordLifecycle) and the
 * global error boundary (asyncStore.fail) wired into an Elysia app.
 *
 * Verifies the row transitions:
 *   - track → pending
 *   - progress → in_progress (via triggerAutoGeneration-style calls)
 *   - recordLifecycle afterHandle → complete (status/headers/body captured)
 *   - error boundary → failed with error populated, completedAt set
 *
 * @see TASK-async-store-complete-fail-lifecycle-hooks.md
 */

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { createAsyncStore, } from "../async/store";
import type { DB, } from "../db/schema";
import { recordLifecycle, } from "../middleware/lifecycle";
import { requestIdMiddleware, } from "../middleware/request-id";
import { createTestDb, } from "../test-utils/create-test-db";

describe("recordLifecycle (Elysia integration)", () => {
  let db: Kysely<DB>;
  let store: ReturnType<typeof createAsyncStore>;

  beforeEach(async () => {
    ({ db, } = await createTestDb());
    store = createAsyncStore(db, { defaultTtlMs: 60_000, },);
  },);

  afterEach(async () => {
    store.destroy();
    await db.destroy();
  },);

  function makeApp() {
    return new Elysia()
      .derive(requestIdMiddleware(),)
      .onAfterHandle(recordLifecycle(store,),)
      .onError((ctx: { requestId?: string; error: unknown },) => {
        const requestId = ctx.requestId;
        if (requestId) { store.fail(requestId, String(ctx.error,),); }
      },);
  }

  // Mirror reply.ts: track() is called before the response is produced.
  // complete/fail writes are UPDATEs and require a pre-existing row.

  test("afterHandle completes the row with captured status + body", async () => {
    const app = makeApp();
    app.post("/api/x", () =>
      new Response(JSON.stringify({ ok: true, },), {
        status: 201,
        headers: { "content-type": "application/json", "x-trace": "abc", },
      },),);

    store.track({ id: "lc-1", method: "POST", routePattern: "/api/x", userId: "u-1", },);

    await app.handle(
      new Request("http://localhost/api/x", {
        method: "POST",
        headers: { "x-request-id": "lc-1", "content-type": "application/json", },
        body: "{}",
      },),
    );

    await store.flush();
    const row = await store.read("lc-1",);
    expect(row,).not.toBeNull();
    expect(row?.status,).toBe("complete",);
    expect(row?.responseStatus,).toBe(201,);
    expect(row?.responseBody,).toBe(JSON.stringify({ ok: true, },),);
    // Blocked headers (content-length) are never captured; x-trace survives.
    expect(row?.responseHeaders?.["x-trace"],).toBe("abc",);
    expect(row?.completedAt,).not.toBeNull();
  });

  test("Set-Cookie header is stripped from the captured snapshot", async () => {
    const app = makeApp();
    app.post("/api/x", () =>
      new Response("ok", {
        status: 200,
        headers: { "set-cookie": "session=secret", "x-keep": "yes", },
      },),);

    store.track({ id: "lc-2", method: "POST", routePattern: "/api/x", userId: null, },);

    await app.handle(
      new Request("http://localhost/api/x", {
        method: "POST",
        headers: { "x-request-id": "lc-2", },
        body: "{}",
      },),
    );

    await store.flush();
    const row = await store.read("lc-2",);
    expect(row?.status,).toBe("complete",);
    expect(row?.responseHeaders,).not.toHaveProperty("set-cookie",);
    expect(row?.responseHeaders?.["x-keep"],).toBe("yes",);
  });

  test("error boundary marks the row as failed with the error message", async () => {
    const app = makeApp();
    app.post("/api/x", () => {
      throw new Error("handler blew up",);
    },);

    store.track({ id: "lc-3", method: "POST", routePattern: "/api/x", userId: null, },);

    const res = await app.handle(
      new Request("http://localhost/api/x", {
        method: "POST",
        headers: { "x-request-id": "lc-3", },
        body: "{}",
      },),
    );
    expect(res.status,).toBe(500,);

    await store.flush();
    const row = await store.read("lc-3",);
    expect(row,).not.toBeNull();
    expect(row?.status,).toBe("failed",);
    expect(row?.error,).toContain("handler blew up",);
    expect(row?.responseBody,).toBeNull();
  });

  test("request with no id is ignored by the lifecycle hook", async () => {
    const app = makeApp();
    app.post("/api/x", () => new Response("ok", { status: 200, },),);

    await app.handle(new Request("http://localhost/api/x", { method: "POST", body: "{}", },),);
    await store.flush();
    // No row should have been written (no requestId ⇒ no track, no complete).
    expect(await store.read("anything",),).toBeNull();
  });

  test("full pipeline: track → progress → complete", async () => {
    const app = makeApp();
    app.post("/api/x", () => new Response("done", { status: 201, },),);

    // Simulate what reply.ts + triggerAutoGeneration do:
    store.track({ id: "pipe-1", method: "POST", routePattern: "/api/x", userId: "u-1", },);
    store.progress("pipe-1", { progress: { step: "generating", }, },);
    await store.flush();

    let row = await store.read("pipe-1",);
    expect(row?.status,).toBe("in_progress",);
    expect(row?.progress,).toEqual({ step: "generating", },);

    // Now the request completes and the afterHandle fires.
    await app.handle(
      new Request("http://localhost/api/x", {
        method: "POST",
        headers: { "x-request-id": "pipe-1", },
        body: "{}",
      },),
    );
    await store.flush();

    row = await store.read("pipe-1",);
    expect(row?.status,).toBe("complete",);
    expect(row?.responseStatus,).toBe(201,);
    expect(row?.responseBody,).toBe("done",);
  });
});
