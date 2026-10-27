// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * SW-6 — the idempotency cache key must be scoped by the RESOLVED path, not
 * only by the route pattern. The pattern is shared by every resource of a
 * route family, so one client request id reused on two different resources
 * replayed the first response and silently dropped the second write.
 */
import { describe, expect, test, } from "bun:test";
import { type IdempotencyCtx, idempotent, } from "./idempotency";
import { makeKey, } from "./idempotency-utils";

/** Minimal ctx — the request URL carries the resolved path. */
function makeCtx(path: string,): IdempotencyCtx {
  return {
    request: new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "x-request-id": "req-1", },
    },),
    route: "/api/chats/:id/messages",
    requestId: "req-1",
    userId: "u-1",
  };
}

/** Drive the in-progress microtask that records the response body. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("idempotency key scope (SW-6)", () => {
  test("makeKey separates two resources that share a route pattern", () => {
    const pattern = "/api/chats/:id/messages";
    const keyA = makeKey("POST", pattern, "req-1", "u-1", "/api/chats/chat-A/messages",);
    const keyB = makeKey("POST", pattern, "req-1", "u-1", "/api/chats/chat-B/messages",);
    expect(keyA,).not.toBe(keyB,);
  });

  test("makeKey is stable for the same resolved path", () => {
    const pattern = "/api/chats/:id/messages";
    expect(makeKey("POST", pattern, "req-1", "u-1", "/api/chats/chat-A/messages",),).toBe(
      makeKey("POST", pattern, "req-1", "u-1", "/api/chats/chat-A/messages",),
    );
  });

  test("one request id on two resources does not replay the first response", async () => {
    const idem = idempotent({ backend: "memory", },);
    // The first request reserves the slot for chat A.
    expect(await idem.beforeHandle(makeCtx("/api/chats/chat-A/messages",),),).toBeUndefined();
    // The same request id on chat B is a DIFFERENT resource: it must get its
    // own slot — not a replay of chat A and not a 409 on chat A's slot.
    expect(await idem.beforeHandle(makeCtx("/api/chats/chat-B/messages",),),).toBeUndefined();
  });

  test("the same resource still replays the cached response", async () => {
    const idem = idempotent({ backend: "memory", },);
    const ctx = makeCtx("/api/chats/chat-A/messages",);
    expect(await idem.beforeHandle(ctx,),).toBeUndefined();
    idem.recordResponse({
      method: "POST",
      route: ctx.route ?? "?",
      requestId: "req-1",
      userId: "u-1",
      resolvedPath: "/api/chats/chat-A/messages",
      response: new Response("done", { status: 200, },),
    },);

    await flushMicrotasks();
    const replay = await idem.beforeHandle(ctx,);
    expect(replay?.status,).toBe(200,);
    expect(await replay?.text(),).toBe("done",);
  });
});
