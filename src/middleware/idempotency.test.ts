// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { createLogger, getLogger, setGlobalLogger, } from "../logger";
import type { LogEntry, Transport, } from "../logger/types";
import { type IdempotencyCtx, idempotent, } from "./idempotency";

/**
 * @param method
 * @param route
 * @param requestId
 * @param body
 */
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
    const ctxA = { ...makeCtx("POST", "/api/x", "shared",), userId: "user-A", };
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
    const replay = await idem.beforeHandle({ ...makeCtx("POST", "/api/x", "shared",), userId: "user-B", },);
    expect(replay,).toBeUndefined();
    // And A's replay still works on its own key.
    const aReplay = await idem.beforeHandle(ctxA,);
    expect(aReplay,).toBeInstanceOf(Response,);
    if (aReplay) { expect(await aReplay.text(),).toBe("A's payload",); }
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

// F14 regression: a Response whose `.text()` rejects (stream errors mid-read)
// must NOT leave the in-flight slot forever. The `.catch` handler releases
// the slot so the next request can run. Without the .catch, Bun terminates
// the process with `unhandled rejection` and the slot stays in-flight
// indefinitely.
describe("idempotent (memory backend) — recordResponse failure recovery", () => {
  test("recordResponse with an erroring body stream releases the slot", async () => {
    const idem = idempotent({ backend: "memory", },);
    const beforeCtx = makeCtx("POST", "/api/x", "r-body-err",);
    expect(await idem.beforeHandle(beforeCtx,),).toBeUndefined();
    const errorStream = new ReadableStream({
      start(controller,) {
        controller.error(new Error("stream error",),);
      },
    },);
    const erroringResponse = new Response(errorStream, { status: 200, },);
    idem.recordResponse({
      method: "POST",
      route: "/api/x",
      requestId: "r-body-err",
      response: erroringResponse,
    },);
    // Yield so `.text()` rejects and `.catch` runs `release()`.
    await flushMicrotasks();
    await flushMicrotasks();
    await nextTick();
    // Next request must NOT see 409 — the slot was released on failure.
    const next = await idem.beforeHandle(makeCtx("POST", "/api/x", "r-body-err",),);
    expect(next,).toBeUndefined();
  });

  test("recordResponse caches successfully when body stream resolves normally", async () => {
    const idem = idempotent({ backend: "memory", },);
    const beforeCtx = makeCtx("POST", "/api/x", "r-body-ok",);
    expect(await idem.beforeHandle(beforeCtx,),).toBeUndefined();
    idem.recordResponse({
      method: "POST",
      route: "/api/x",
      requestId: "r-body-ok",
      response: new Response("hello", { status: 200, },),
    },);
    await flushMicrotasks();
    // Slot is completed; the next request must replay from cache.
    const replay = await idem.beforeHandle(makeCtx("POST", "/api/x", "r-body-ok",),);
    expect(replay?.status,).toBe(200,);
    expect(await replay?.text(),).toBe("hello",);
  });

  // F14.S5: assert the warn log carries the PII-redacted methodRoute,
  // not the full cache key. Without `redactKeyForLog` in the log call,
  // the captured meta would contain the userId + requestId embedded in
  // the key — a privacy regression.
  test("recordResponse warn log emits PII-redacted methodRoute", async () => {
    const captured: Array<{ message: string; meta?: Record<string, unknown> }> = [];
    const capturingTransport: Transport = {
      name: "capture",
      async write(entry: LogEntry,): Promise<void> {
        captured.push({
          message: typeof entry.message === "string" ? entry.message : "non-string",
          meta: entry.meta,
        },);
      },
      async flush(): Promise<void> {},
    };
    const log = createLogger({ level: "warn", },);
    log.addTransport(capturingTransport,);
    // Capture the prior global logger for restoration in finally. Without
    // this, the test would leak its logger into subsequent tests and any
    // warn-level emissions would leak to stdout.
    let priorLogger: ReturnType<typeof getLogger> | null = null;
    try {
      priorLogger = getLogger();
    } catch {
      // No global logger yet — fine.
    }
    setGlobalLogger(log,);
    try {
      const idem = idempotent({ backend: "memory", },);
      const beforeCtx = { ...makeCtx("POST", "/api/x", "r-pii-secret",), userId: "user-secret-7a3b", };
      expect(await idem.beforeHandle(beforeCtx,),).toBeUndefined();
      const errorStream = new ReadableStream({
        start(controller,) {
          controller.error(new Error("stream error",),);
        },
      },);
      idem.recordResponse({
        method: "POST",
        route: "/api/x",
        requestId: "r-pii-secret",
        userId: "user-secret-7a3b",
        response: new Response(errorStream, { status: 200, },),
      },);
      // Yield so .text() rejects and .catch fires the warn log.
      await flushMicrotasks();
      await flushMicrotasks();
      await nextTick();
      // The async log queue batches on a 100ms timer — flush it so
      // captured entries are observable in this test.
      await log.flush();
      const entry = captured.find((e,) => e.message === "idempotency.record_response.failed");
      expect(entry,).toBeDefined();
      expect(entry?.meta?.methodRoute,).toBe("POST /api/x",);
      const serialized = JSON.stringify(entry?.meta ?? {},);
      expect(serialized.includes("user-secret-7a3b",),).toBe(false,);
      expect(serialized.includes("r-pii-secret",),).toBe(false,);
    } finally {
      // Reset to a fresh empty logger so subsequent tests don't capture.
      // Restore the prior global logger (captured before setGlobalLogger
      // above) so subsequent tests inherit the same global logger the
      // suite was running with.
      if (priorLogger) { setGlobalLogger(priorLogger,); }
    }
  });
});
// AC8: idempotency rejects duplicate rotation triggers.
// The DELETE participant route in src/routes/chats/participants.ts triggers
// `rotateKeyOnLeave`. Two requests with the same Idempotency-Key on this
// route must NOT trigger a second rotation — they replay the first response
// (same event id) or return 409 while the first is in flight. Both paths
// are covered below.
describe("idempotent (memory backend) — rotation trigger dedup (AC8)", () => {
  const ROTATION_ROUTE = "/api/chats/:id/participants/:actorId";

  test("two identical rotation-trigger requests replay the same event id (no second rotation)", async () => {
    const idem = idempotent({ backend: "memory", },);
    const firstCtx = makeCtx("DELETE", ROTATION_ROUTE, "rotate-key-1",);
    expect(await idem.beforeHandle(firstCtx,),).toBeUndefined();
    const eventId = "rot-evt-aaaa-1111";
    const response = new Response(
      JSON.stringify({ eventId, rotatedMessages: 3, rotatedAssets: 1, },),
      { status: 200, headers: { "Content-Type": "application/json", }, },
    );
    idem.recordResponse({
      method: "DELETE",
      route: ROTATION_ROUTE,
      requestId: "rotate-key-1",
      response,
    },);
    await flushMicrotasks();
    const secondCtx = makeCtx("DELETE", ROTATION_ROUTE, "rotate-key-1",);
    const replay = await idem.beforeHandle(secondCtx,);
    expect(replay,).toBeInstanceOf(Response,);
    if (replay) {
      expect(replay.status,).toBe(200,);
      const body = await replay.json() as { eventId: string; rotatedMessages: number };
      expect(body.eventId,).toBe(eventId,);
    }
  });

  test("second rotation request fired before the first completes returns 409 (in-flight)", async () => {
    const idem = idempotent({ backend: "memory", },);
    expect(await idem.beforeHandle(makeCtx("DELETE", ROTATION_ROUTE, "rotate-key-2",),),).toBeUndefined();
    const replay = await idem.beforeHandle(makeCtx("DELETE", ROTATION_ROUTE, "rotate-key-2",),);
    expect(replay?.status,).toBe(409,);
    expect(await replay?.json(),).toMatchObject({ code: "CONFLICT", },);
  });
});
