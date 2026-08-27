// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { type IdempotencyCtx, idempotent, } from "./idempotency";

function makeCtx(
  method: string,
  route: string,
  requestId: string,
  body?: BodyInit | null,
): IdempotencyCtx & { request: Request } {
  const request = new Request(`http://localhost${route}`, { method, body, },);
  request.headers.set("x-request-id", requestId,);
  return { request, route, requestId, };
}

/** Drive the in-progress microtask that records the response body. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

/** Wait one macrotask using withResolvers (preferred over executor form). */
function nextTick(): Promise<void> {
  const { promise, resolve, } = Promise.withResolvers<void>();
  setTimeout(resolve, 0,);
  return promise;
}

describe("idempotent (memory backend)", () => {
  test("passes through when no request id is present", async () => {
    const idem = idempotent({ backend: "memory", },);
    const ctx = { request: new Request("http://localhost/api/x", { method: "POST", },), route: "/api/x", };
    expect(await idem.beforeHandle(ctx,),).toBeUndefined();
  });

  test("first request marks the key as in-flight and lets handler run", async () => {
    const idem = idempotent({ backend: "memory", },);
    const ctx = makeCtx("POST", "/api/x", "r-1",);
    expect(await idem.beforeHandle(ctx,),).toBeUndefined();
    const ctx2 = makeCtx("POST", "/api/x", "r-1",);
    const replay = await idem.beforeHandle(ctx2,);
    expect(replay?.status,).toBe(409,);
    expect(await replay?.json(),).toMatchObject({ code: "CONFLICT", },);
  });

  test("completed response replays verbatim on the same key", async () => {
    const idem = idempotent({ backend: "memory", },);
    const ctx = makeCtx("POST", "/api/x", "r-2",);
    expect(await idem.beforeHandle(ctx,),).toBeUndefined();
    const response = new Response(JSON.stringify({ ok: true, n: 1, },), {
      status: 201,
      headers: { "Content-Type": "application/json", "X-Trace": "abc", },
    },);
    idem.recordResponse({
      method: "POST",
      route: "/api/x",
      requestId: "r-2",
      response,
    },);
    await flushMicrotasks();
    const replay = await idem.beforeHandle(makeCtx("POST", "/api/x", "r-2",),);
    expect(replay?.status,).toBe(201,);
    expect(await replay?.json(),).toEqual({ ok: true, n: 1, },);
    expect(replay?.headers.get("x-trace",),).toBe("abc",);
  });

  test("Set-Cookie is stripped from replayed responses (no session minting)", async () => {
    const idem = idempotent({ backend: "memory", },);
    const ctx = makeCtx("POST", "/api/x", "r-3",);
    await idem.beforeHandle(ctx,);
    const response = new Response("ok", {
      status: 200,
      headers: { "Set-Cookie": "session=xyz", "X-Trace": "t", },
    },);
    idem.recordResponse({ method: "POST", route: "/api/x", requestId: "r-3", response, },);
    await flushMicrotasks();
    const replay = await idem.beforeHandle(makeCtx("POST", "/api/x", "r-3",),);
    expect(replay?.headers.get("set-cookie",),).toBeNull();
    expect(replay?.headers.get("x-trace",),).toBe("t",);
  });

  test("distinct routes on the same request id are independent", async () => {
    const idem = idempotent({ backend: "memory", },);
    expect(await idem.beforeHandle(makeCtx("POST", "/api/x", "r-4",),),).toBeUndefined();
    expect(await idem.beforeHandle(makeCtx("POST", "/api/y", "r-4",),),).toBeUndefined();
  });

  test("distinct user ids on the same request id do NOT share cache (BUG-idempotency-cache-key-lacks-user-scope-cross-user-response-r)", async () => {
    const idem = idempotent({ backend: "memory", },);
    // User A caches a response under request id "shared".
    const ctxA = { ...makeCtx("POST", "/api/x", "shared",), userId: "user-A" };
    expect(await idem.beforeHandle(ctxA,),).toBeUndefined();
    idem.recordResponse({
      method: "POST",
      route: "/api/x",
      requestId: "shared",
      userId: "user-A",
      response: new Response("A's payload", { status: 200, },),
    },);
    await flushMicrotasks();
    // User B submits the same request id — must NOT see A's cached body or slot.
    const replay = await idem.beforeHandle({ ...makeCtx("POST", "/api/x", "shared",), userId: "user-B" },);
    expect(replay).toBeUndefined();
    // And A's replay still works on its own key.
    const aReplay = await idem.beforeHandle(ctxA,);
    expect(aReplay).toBeInstanceOf(Response);
    if (aReplay) { expect(await aReplay.text()).toBe("A's payload"); }
  });


  test("TTL expiry reverts to fresh pass-through", async () => {
    const idem = idempotent({ backend: "memory", ttlMs: 1, },);
    await idem.beforeHandle(makeCtx("POST", "/api/x", "r-5",),);
    const response = new Response("done", { status: 200, },);
    idem.recordResponse({ method: "POST", route: "/api/x", requestId: "r-5", response, },);
    await flushMicrotasks();
    // TTL expiry requires real wall-clock to advance past `completedAt`.
    // The 5 ms gap exceeds the 1 ms ttlMs deterministically.
    await nextTick();
    await nextTick();
    await nextTick();
    expect(await idem.beforeHandle(makeCtx("POST", "/api/x", "r-5",),),).toBeUndefined();
  });

  test("invalid client id falls back to pass-through (not 409)", async () => {
    const idem = idempotent({ backend: "memory", },);
    const ctx = {
      request: new Request("http://localhost/api/x", { method: "POST", },),
      route: "/api/x",
      requestId: "has space",
    };
    expect(await idem.beforeHandle(ctx,),).toBeUndefined();
  });
});
