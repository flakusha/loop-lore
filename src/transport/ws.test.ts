// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for transport/ws.ts — WsHandler frame edge cases, close codes, and
 * error paths.
 *
 * WsHandler never opens real sockets in tests: `connect()` only builds the
 * connection descriptor, and the socket arrives via `attach()`. These tests
 * drive the handler with fake WebSocket objects to cover:
 *
 *   - remoteAddr resolution (url vs host:port defaults)
 *   - metadata defaults (pingInterval 30s)
 *   - ping interval arming/teardown via stubbed timers
 *   - attach() flush semantics (OPEN now vs deferred until "open")
 *   - flushPending() re-buffer on mid-flush send failure
 *   - send() direct-vs-queued decision and the 1000-message queue cap
 *   - close() code/reason (1000 "client close") and post-close errors
 */
import { describe, expect, it, } from "bun:test";
import { TransportErrorCode, } from "../db/enums";
import { TransportError, } from "./errors";
import { createWsHandler, WsHandler, } from "./ws";

/** Minimal WebSocket stand-in — records sends/closes/pings, fires events. */
function makeFakeWs(
  readyState: number = WebSocket.OPEN,
  opts: { failOnSend?: (data: string | Uint8Array,) => boolean } = {},
) {
  const listeners = new Map<string, Array<() => void>>();
  const ws = {
    readyState,
    sent: [] as Array<string | Uint8Array>,
    closeCalls: [] as Array<{ code: number; reason: string }>,
    pingCount: 0,
    send(data: string | Uint8Array,): void {
      if (opts.failOnSend?.(data,)) { throw new Error("send boom",); }
      ws.sent.push(data,);
    },
    ping(): void {
      ws.pingCount++;
    },
    close(code: number, reason: string,): void {
      ws.closeCalls.push({ code, reason, },);
    },
    addEventListener(event: string, fn: () => void,): void {
      const list = listeners.get(event,) ?? [];
      list.push(fn,);
      listeners.set(event, list,);
    },
    emit(event: string,): void {
      for (const fn of listeners.get(event,) ?? []) { fn(); }
    },
  };

  return ws;
}

/** Swap setInterval/clearInterval for recording stubs; returns restore. */
function stubTimers() {
  const realSetInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;
  const state = {
    intervalFn: undefined as (() => void) | undefined,
    intervalMs: undefined as number | undefined,
    intervalHandle: {} as unknown,
    cleared: [] as unknown[],
  };

  globalThis.setInterval = ((fn: () => void, ms: number,) => {
    state.intervalFn = fn;
    state.intervalMs = ms;
    return state.intervalHandle;
  }) as typeof setInterval;

  globalThis.clearInterval = ((h: unknown,) => {
    state.cleared.push(h,);
  }) as typeof clearInterval;

  return {
    state,
    restore: () => {
      globalThis.setInterval = realSetInterval;
      globalThis.clearInterval = realClearInterval;
    },
  };
}

describe("createWsHandler", () => {
  it("returns a WsHandler instance", () => {
    expect(createWsHandler(),).toBeInstanceOf(WsHandler,);
  });
});

describe("WsHandler — connection descriptor", () => {
  it("remoteAddr prefers the url option", async () => {
    const handler = createWsHandler({ url: "wss://example.com/socket", },);
    const conn = await handler.connect();
    expect(conn.remoteAddr,).toBe("wss://example.com/socket",);
    await handler.close();
  });

  it("remoteAddr falls back to localhost:3000 defaults", async () => {
    const handler = createWsHandler();
    const conn = await handler.connect();
    expect(conn.remoteAddr,).toBe("localhost:3000",);
    await handler.close();
  });

  it("remoteAddr uses custom host and port", async () => {
    const handler = createWsHandler({ host: "example.com", port: 9000, },);
    const conn = await handler.connect();
    expect(conn.remoteAddr,).toBe("example.com:9000",);
    await handler.close();
  });

  it("metadata defaults pingInterval to 30s and enables pingPong", async () => {
    const handler = createWsHandler();
    const conn = await handler.connect();
    expect(conn.metadata,).toEqual({ pingPong: true, pingInterval: 30_000, },);
    await handler.close();
  });

  it("connect is idempotent — second call returns the same connection", async () => {
    const handler = createWsHandler();
    const first = await handler.connect();
    const second = await handler.connect();
    expect(second,).toBe(first,);
    await handler.close();
  });
});

describe("WsHandler — ping interval", () => {
  it("arms a ping interval at the configured period when url is set", async () => {
    const timers = stubTimers();
    try {
      const handler = createWsHandler({ url: "ws://example.com", pingInterval: 1234, },);
      await handler.connect();
      expect(timers.state.intervalMs,).toBe(1234,);
      const ws = makeFakeWs();
      handler.attach(ws as unknown as WebSocket,);
      expect(ws.pingCount,).toBe(0,);
      timers.state.intervalFn!();
      expect(ws.pingCount,).toBe(1,);
      await handler.close();
      expect(timers.state.cleared,).toContain(timers.state.intervalHandle,);
    } finally {
      timers.restore();
    }
  });

  it("defaults the ping interval to 30s", async () => {
    const timers = stubTimers();
    try {
      const handler = createWsHandler({ url: "ws://example.com", },);
      await handler.connect();
      expect(timers.state.intervalMs,).toBe(30_000,);
      await handler.close();
    } finally {
      timers.restore();
    }
  });

  it("does not arm a ping interval without url", async () => {
    const timers = stubTimers();
    try {
      const handler = createWsHandler({ port: 3000, },);
      await handler.connect();
      expect(timers.state.intervalFn,).toBeUndefined();
      await handler.close();
    } finally {
      timers.restore();
    }
  });
});

describe("WsHandler — attach and flush", () => {
  it("flushes queued messages immediately when attached socket is OPEN", async () => {
    const handler = createWsHandler();
    await handler.connect();
    handler.send("a",);
    handler.send("b",);
    const ws = makeFakeWs(WebSocket.OPEN,);
    handler.attach(ws as unknown as WebSocket,);
    expect(ws.sent,).toEqual(["a", "b",],);
    await handler.close();
  });

  it("defers flush until open when attached socket is CONNECTING", async () => {
    const handler = createWsHandler();
    await handler.connect();
    const ws = makeFakeWs(WebSocket.CONNECTING,);
    handler.attach(ws as unknown as WebSocket,);
    handler.send("queued",);
    expect(ws.sent,).toEqual([],);
    ws.emit("open",);
    expect(ws.sent,).toEqual(["queued",],);
    await handler.close();
  });

  it("re-buffers unsent messages when a send fails mid-flush", async () => {
    const handler = createWsHandler();
    await handler.connect();
    handler.send("m1",);
    handler.send("m2",);
    handler.send("m3",);
    const failing = makeFakeWs(WebSocket.OPEN, { failOnSend: (d,) => d === "m2", },);
    expect(() => handler.attach(failing as unknown as WebSocket,)).toThrow(/boom/,);
    expect(failing.sent,).toEqual(["m1",],);
    const pending = (handler as unknown as { pendingMessages: unknown[] }).pendingMessages;
    expect(pending,).toEqual(["m2", "m3",],);
    const healthy = makeFakeWs(WebSocket.OPEN,);
    handler.attach(healthy as unknown as WebSocket,);
    expect(healthy.sent,).toEqual(["m2", "m3",],);
    await handler.close();
  });
});

describe("WsHandler — send", () => {
  it("sends string and binary frames directly when OPEN", async () => {
    const handler = createWsHandler();
    await handler.connect();
    const ws = makeFakeWs(WebSocket.OPEN,);
    handler.attach(ws as unknown as WebSocket,);
    await handler.send("hello",);
    await handler.send(new Uint8Array([1, 2, 3,],),);
    expect(ws.sent.length,).toBe(2,);
    expect(ws.sent[0],).toBe("hello",);
    expect(Array.from(ws.sent[1] as Uint8Array,),).toEqual([1, 2, 3,],);
    await handler.close();
  });

  it("queues messages while no socket is attached", async () => {
    const handler = createWsHandler();
    await handler.connect();
    await handler.send("one",);
    await handler.send("two",);
    const pending = (handler as unknown as { pendingMessages: unknown[] }).pendingMessages;
    expect(pending,).toEqual(["one", "two",],);
    await handler.close();
  });

  it("keeps a full 1000-message queue intact — no drop at the boundary", async () => {
    const handler = createWsHandler();
    await handler.connect();
    for (let i = 0; i < 1000; i++) { await handler.send(`keep-${i}`,); }
    const ws = makeFakeWs(WebSocket.OPEN,);
    handler.attach(ws as unknown as WebSocket,);
    expect(ws.sent,).toHaveLength(1000,);
    expect(ws.sent[0],).toBe("keep-0",);
    await handler.close();
  });

  it("drops the oldest message beyond the 1000 cap", async () => {
    const handler = createWsHandler();
    await handler.connect();
    for (let i = 0; i < 1001; i++) { await handler.send(`msg-${i}`,); }
    const ws = makeFakeWs(WebSocket.OPEN,);
    handler.attach(ws as unknown as WebSocket,);
    expect(ws.sent,).toHaveLength(1000,);
    expect(ws.sent[0],).toBe("msg-1",);
    expect(ws.sent[999],).toBe("msg-1000",);
    await handler.close();
  });
});

describe("WsHandler — close", () => {
  it("closes the socket with code 1000 and a client-close reason", async () => {
    const handler = createWsHandler();
    await handler.connect();
    const ws = makeFakeWs(WebSocket.OPEN,);
    handler.attach(ws as unknown as WebSocket,);
    await handler.close();
    expect(ws.closeCalls,).toEqual([{ code: 1000, reason: "client close", },],);
  });

  it("resolves when closed without a connect or socket", async () => {
    const handler = createWsHandler();
    await handler.close();
    await handler.close();
  });

  it("rejects send and get after close with ConnectionClosed", async () => {
    const handler = createWsHandler();
    await handler.connect();
    await handler.close();
    expect(() => handler.send("x",)).toThrow(TransportError,);
    try {
      handler.send("x",);
      expect.unreachable("send must throw after close",);
    } catch (err) {
      expect((err as TransportError).code,).toBe(TransportErrorCode.ConnectionClosed,);
    }

    expect(() => handler.get("pingPong",)).toThrow(TransportError,);
  });
});

describe("WsHandler — get", () => {
  it("returns empty string for non-string and missing metadata", async () => {
    const handler = createWsHandler();
    await handler.connect();
    expect(await handler.get("pingPong",),).toBe("",);
    expect(await handler.get("missing",),).toBe("",);
    await handler.close();
  });
});
