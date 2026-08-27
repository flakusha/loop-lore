// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Integration test for the idempotent() middleware wired into an Elysia app.
 *
 * Exercises the real beforeHandle/afterHandle flow (not the isolated unit
 * helpers) to verify:
 *   - first POST with a request id → handler runs; response cached
 *   - second POST while in flight → 409, handler NOT re-run
 *   - second POST after completion → cached response replayed verbatim
 *   - X-Idempotency-Bypass: 1 → handler runs (cache skipped)
 *   - no X-Request-Id → no idempotency check
 *   - malformed request id → no idempotency check
 *   - 4xx response → NOT cached; slot released so retry runs handler again
 *   - GET → never idempotent (method check)
 *
 * @see TASK-middleware-idempotency-wire-into-elysia.md
 */

import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { IDEMPOTENCY_BYPASS_HEADER, idempotent, } from "./idempotency";
import { requestIdMiddleware, } from "./request-id";

/** Drive the in-progress microtask that records the response body. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

interface SetupOpts {
  handler: (ctx: { body: unknown; request: Request },) => Response | Promise<Response>;
}

/** Build a minimal app with request-id derive + idempotent before/afterHandle. */
function setup(opts: SetupOpts,) {
  const idem = idempotent({ backend: "memory", },);
  const app = new Elysia()
    .derive(requestIdMiddleware(),)
    .onBeforeHandle((ctx,) =>
      idem.beforeHandle({
        request: ctx.request,
        route: ctx.route,
        requestId: (ctx as unknown as { requestId?: string }).requestId,
      },)
    )
    .onAfterHandle((ctx: { request: Request; route: string; requestId?: string; response?: unknown },) => {
      const requestId = ctx.requestId;
      if (!requestId) { return; }
      const response = ctx.response;
      // Cache only successful Response objects. Everything else releases the
      // in-flight slot so the client can retry.
      if (!(response instanceof Response) || response.status >= 300) {
        idem.release({ method: ctx.request.method, route: ctx.route, requestId, },);
        return;
      }
      idem.recordResponse({
        method: ctx.request.method,
        route: ctx.route,
        requestId,
        response,
      },);
    },);

  return app.post("/api/x", opts.handler,);
}

describe("idempotent (Elysia integration)", () => {
  test("first POST runs the handler and caches the response", async () => {
    let runs = 0;
    const app = setup({
      handler: () => {
        runs++;
        return new Response("ok-first", { status: 201, },);
      },
    },);

    const res = await app.handle(
      new Request("http://localhost/api/x", {
        method: "POST",
        headers: { "x-request-id": "r-1", "content-type": "application/json", },
        body: "{}",
      },),
    );
    expect(res.status,).toBe(201,);
    expect(await res.text(),).toBe("ok-first",);
    expect(runs,).toBe(1,);
  });

  test("second POST while in flight returns 409 and does NOT re-run the handler", async () => {
    let runs = 0;
    const app = setup({
      handler: async () => {
        await Promise.resolve();
        runs++;
        return new Response("done", { status: 201, },);
      },
    },);

    const first = app.handle(
      new Request("http://localhost/api/x", {
        method: "POST",
        headers: { "x-request-id": "r-2", "content-type": "application/json", },
        body: "{}",
      },),
    );
    const second = await app.handle(
      new Request("http://localhost/api/x", {
        method: "POST",
        headers: { "x-request-id": "r-2", "content-type": "application/json", },
        body: "{}",
      },),
    );
    expect(second.status,).toBe(409,);
    expect(await second.json(),).toMatchObject({ code: "CONFLICT", },);
    await first;
    expect(runs,).toBe(1,);
  });

  test("second POST after completion replays the cached response verbatim", async () => {
    let runs = 0;
    const app = setup({
      handler: () => {
        runs++;
        return new Response(JSON.stringify({ n: runs, },), {
          status: 201,
          headers: { "content-type": "application/json", "x-trace": "abc", },
        },);
      },
    },);

    const first = await app.handle(
      new Request("http://localhost/api/x", {
        method: "POST",
        headers: { "x-request-id": "r-3", "content-type": "application/json", },
        body: "{}",
      },),
    );
    expect(first.status,).toBe(201,);
    expect(await first.json(),).toEqual({ n: 1, },);

    await flushMicrotasks();

    const second = await app.handle(
      new Request("http://localhost/api/x", {
        method: "POST",
        headers: { "x-request-id": "r-3", "content-type": "application/json", },
        body: "{}",
      },),
    );
    expect(second.status,).toBe(201,);
    expect(await second.json(),).toEqual({ n: 1, },);
    expect(second.headers.get("x-trace",),).toBe("abc",);
    expect(runs,).toBe(1,);
  });

  test("X-Idempotency-Bypass: 1 skips the cache and runs the handler", async () => {
    let runs = 0;
    const app = setup({
      handler: () => {
        runs++;
        return new Response(`run-${runs}`, { status: 201, },);
      },
    },);

    const first = await app.handle(
      new Request("http://localhost/api/x", {
        method: "POST",
        headers: { "x-request-id": "r-4", "content-type": "application/json", },
        body: "{}",
      },),
    );
    expect(await first.text(),).toBe("run-1",);
    await flushMicrotasks();

    const second = await app.handle(
      new Request("http://localhost/api/x", {
        method: "POST",
        headers: { "x-request-id": "r-4", [IDEMPOTENCY_BYPASS_HEADER]: "1", "content-type": "application/json", },
        body: "{}",
      },),
    );
    expect(second.status,).toBe(201,);
    expect(await second.text(),).toBe("run-2",);
    expect(runs,).toBe(2,);
  });

  test("POST with no X-Request-Id is not idempotent (handler runs every time)", async () => {
    let runs = 0;
    const app = setup({
      handler: () => {
        runs++;
        return new Response("ok", { status: 201, },);
      },
    },);

    await app.handle(new Request("http://localhost/api/x", { method: "POST", body: "{}", },),);
    await app.handle(new Request("http://localhost/api/x", { method: "POST", body: "{}", },),);
    expect(runs,).toBe(2,);
  });

  test("POST with a malformed request id is not idempotent", async () => {
    let runs = 0;
    const app = setup({
      handler: () => {
        runs++;
        return new Response("ok", { status: 201, },);
      },
    },);

    await app.handle(
      new Request("http://localhost/api/x", {
        method: "POST",
        headers: { "x-request-id": "has space", },
        body: "{}",
      },),
    );
    await app.handle(
      new Request("http://localhost/api/x", {
        method: "POST",
        headers: { "x-request-id": "has space", },
        body: "{}",
      },),
    );
    expect(runs,).toBe(2,);
  });

  test("4xx response is NOT cached and slot is released (retry runs handler)", async () => {
    let runs = 0;
    const app = setup({
      handler: () => {
        runs++;
        return new Response("bad", { status: 400, },);
      },
    },);

    const first = await app.handle(
      new Request("http://localhost/api/x", {
        method: "POST",
        headers: { "x-request-id": "r-5", "content-type": "application/json", },
        body: "{}",
      },),
    );
    expect(first.status,).toBe(400,);
    await flushMicrotasks();

    const second = await app.handle(
      new Request("http://localhost/api/x", {
        method: "POST",
        headers: { "x-request-id": "r-5", "content-type": "application/json", },
        body: "{}",
      },),
    );
    expect(second.status,).toBe(400,);
    expect(runs,).toBe(2,);
  });

  test("GET requests are never idempotent (method check)", async () => {
    let runs = 0;
    const idem = idempotent({ backend: "memory", },);
    const app = new Elysia()
      .derive(requestIdMiddleware(),)
      .onBeforeHandle((ctx,) =>
        idem.beforeHandle({
          request: ctx.request,
          route: ctx.route,
          requestId: (ctx as unknown as { requestId?: string }).requestId,
        },)
      );
    app.get("/api/g", () => {
      runs++;
      return new Response("g", { status: 200, },);
    },);

    await app.handle(new Request("http://localhost/api/g", { headers: { "x-request-id": "g-1", }, },),);
    await app.handle(new Request("http://localhost/api/g", { headers: { "x-request-id": "g-1", }, },),);
    expect(runs,).toBe(2,);
  });
  test("handler throw releases the in-flight slot so a retry is not stuck at 409 (BUG-orphaned-slot)", async () => {
    let runs = 0;
    const idem = idempotent({ backend: "memory", },);
    // Read the derived request id without an unchecked `as` cast: narrow via `in`.
    const readRequestId = (ctx: object,): string | undefined => {
      if ("requestId" in ctx) {
        const id = ctx.requestId;
        return typeof id === "string" ? id : undefined;
      }
      return undefined;
    };
    const app = new Elysia()
      .derive(requestIdMiddleware(),)
      .onBeforeHandle((ctx,) =>
        idem.beforeHandle({
          request: ctx.request,
          route: ctx.route,
          requestId: readRequestId(ctx,),
        },)
      )
      .onAfterHandle((ctx,) => {
        const requestId = readRequestId(ctx,);
        if (!requestId) { return; }
        const response = ctx.response;
        if (!(response instanceof Response) || response.status >= 300) {
          idem.release({ method: ctx.request.method, route: ctx.route, requestId, },);
          return;
        }
        idem.recordResponse({ method: ctx.request.method, route: ctx.route, requestId, response, },);
      },)
      // Mirror elysia-app.ts: the error boundary releases the idempotency slot
      // so a thrown handler does not strand the slot as a permanent 409.
      .onError((ctx,) => {
        const requestId = readRequestId(ctx,);
        if (requestId) {
          idem.release({
            method: ctx.request.method,
            route: new URL(ctx.request.url,).pathname,
            requestId,
          },);
        }
        return new Response("error", { status: 500, },);
      },);
    app.post("/api/x", () => {
      runs++;
      throw new Error("boom",);
    },);

    const first = await app.handle(
      new Request("http://localhost/api/x", {
        method: "POST",
        headers: { "x-request-id": "r-err", "content-type": "application/json", },
        body: "{}",
      },),
    );
    expect(first.status,).toBe(500,);
    await flushMicrotasks();

    const second = await app.handle(
      new Request("http://localhost/api/x", {
        method: "POST",
        headers: { "x-request-id": "r-err", "content-type": "application/json", },
        body: "{}",
      },),
    );
    // Slot released on error → not 409; handler runs again (no permanent 409).
    expect(second.status,).not.toBe(409,);
    expect(runs,).toBe(2,);
  });

  test("cross-user isolation through the production-shaped wiring (BUG-idempotency-cache-key-lacks-user-scope-cross-user-response-r)", async () => {
    // Mirror elysia-app.ts: auth derive sets ctx.userId, then the beforeHandle
    // and onAfterHandle hooks propagate it into the idempotency cache key.
    let runs = 0;
    let lastSeenUser: string | null = null;
    const idem = idempotent({ backend: "memory", },);
    // Narrow with `in` + `typeof` to avoid inline `as` casts (per ts-no-inline-cast-access).
    function readUserId(ctx: object,): string | null {
      if (!("userId" in ctx)) { return null; }
      const raw: unknown = ctx.userId;
      return typeof raw === "string" ? raw : null;
    }
    function readRequestId(ctx: object,): string | undefined {
      if (!("requestId" in ctx)) { return undefined; }
      const raw: unknown = ctx.requestId;
      return typeof raw === "string" ? raw : undefined;
    }
    const app = new Elysia()
      .derive(requestIdMiddleware(),)
      .derive(({ request, },) => {
        // Simulate the auth derive: read x-user-id (set by upstream auth
        // in production). Missing header → anonymous.
        const headerVal = request.headers.get("x-user-id",);
        return { userId: headerVal ?? null, };
      },)
      .onBeforeHandle((ctx,) =>
        idem.beforeHandle({
          request: ctx.request,
          route: ctx.route,
          requestId: readRequestId(ctx,),
          userId: readUserId(ctx,),
        },)
      )
      .onAfterHandle((ctx,) => {
        const requestId = readRequestId(ctx,);
        const userId = readUserId(ctx,);
        if (!requestId) { return; }
        const response = ctx.response;
        if (!(response instanceof Response) || response.status >= 300) {
          idem.release({ method: ctx.request.method, route: ctx.route, requestId, userId, },);
          return;
        }
        idem.recordResponse({
          method: ctx.request.method,
          route: ctx.route,
          requestId,
          userId,
          response,
        },);
      },);
    app.post("/api/x", (ctx,) => {
      const seenUser: unknown = ctx.userId;
      runs++;
      lastSeenUser = typeof seenUser === "string" ? seenUser : null;
      return new Response(`hello from ${seenUser ?? "anon"}`, { status: 200, },);
    },);

    // User A caches under request id "wiring-rid".
    const a = await app.handle(
      new Request("http://localhost/api/x", {
        method: "POST",
        headers: {
          "x-request-id": "wiring-rid",
          "x-user-id": "user-A",
          "content-type": "application/json",
        },
        body: "{}",
      },),
    );
    expect(await a.text(),).toBe("hello from user-A",);
    expect(runs,).toBe(1,);
    await flushMicrotasks();

    // User B submits the same request id — must run fresh, must NOT see A's body.
    const b = await app.handle(
      new Request("http://localhost/api/x", {
        method: "POST",
        headers: {
          "x-request-id": "wiring-rid",
          "x-user-id": "user-B",
          "content-type": "application/json",
        },
        body: "{}",
      },),
    );
    expect(b.status,).toBe(200,);
    expect(await b.text(),).toBe("hello from user-B",);
    expect(runs,).toBe(2,);
    expect(lastSeenUser,).toBe<string | null>("user-B",);

    // User A's replay still works on its own key.
    const aReplay = await app.handle(
      new Request("http://localhost/api/x", {
        method: "POST",
        headers: {
          "x-request-id": "wiring-rid",
          "x-user-id": "user-A",
          "content-type": "application/json",
        },
        body: "{}",
      },),
    );
    expect(await aReplay.text(),).toBe("hello from user-A",);
    expect(runs,).toBe(2,); // replay does not run the handler
  });
});
