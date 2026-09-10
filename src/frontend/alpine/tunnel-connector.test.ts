// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * tunnel-connector: lifecycle, token streaming, reconnect backoff,
 * health checks, and fallback errors — all against a fake socket.
 * Time is fully stubbed (injected `sleep`); the pump below only
 * drains microtasks, never the wall clock.
 */

import { describe, expect, test, } from "bun:test";
import {
  createTunnelConnector,
  type TunnelSocket,
  type TunnelStatus,
  TunnelUnavailable,
} from "./tunnel-connector";
import { httpBaseFromWs, reconnectDelayMs, } from "./tunnel-protocol";

/** Controllable socket double. */
interface FakeSocket extends TunnelSocket {
  sent: string[];
  closed: boolean;
  openIt(): void;
  receive(data: unknown,): void;
  drop(): void;
}

function createFakeSocket(): FakeSocket {
  const socket = {
    sent: [],
    closed: false,
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send(data: string,) {
      socket.sent.push(data,);
    },
    close() {
      socket.closed = true;
    },
    openIt() {
      socket.onopen?.({},);
    },
    receive(data: unknown,) {
      socket.onmessage?.({ data, },);
    },
    drop() {
      socket.onclose?.({},);
    },
  } as FakeSocket;
  return socket;
}

/** Drain pending microtasks (no timers involved). */
function pump(ticks = 20,): Promise<void> {
  let chain = Promise.resolve();
  for (let i = 0; i < ticks; i += 1) {
    chain = chain.then(() => {},);
  }
  return chain;
}

describe("tunnel-connector helpers", () => {
  test("reconnectDelayMs backs off exponentially to the cap", () => {
    expect(reconnectDelayMs(1,),).toBe(500,);
    expect(reconnectDelayMs(2,),).toBe(1000,);
    expect(reconnectDelayMs(3,),).toBe(2000,);
    expect(reconnectDelayMs(10,),).toBe(30000,);
    expect(reconnectDelayMs(100,),).toBe(30000,);
  });

  test("httpBaseFromWs maps schemes and rejects garbage", () => {
    expect(httpBaseFromWs("ws://localhost:8080/tunnel",),).toBe("http://localhost:8080/tunnel",);
    expect(httpBaseFromWs("wss://example.com/t",),).toBe("https://example.com/t",);
    expect(httpBaseFromWs("http://example.com",),).toBeNull();
    expect(httpBaseFromWs("",),).toBeNull();
  });
});

describe("tunnel-connector lifecycle", () => {
  test("connect resolves on open and reports status", async () => {
    const sockets: FakeSocket[] = [];
    const seen: TunnelStatus[] = [];
    const connector = createTunnelConnector("ws://localhost:8080/t", {
      openSocket: (url,) => {
        expect(url,).toBe("ws://localhost:8080/t",);
        const socket = createFakeSocket();
        sockets.push(socket,);
        return socket;
      },
      onStatus: (status,) => seen.push(status,),
    },);
    const connected = connector.connect();
    expect(connector.status,).toBe("connecting",);
    sockets[0]?.openIt();
    await connected;
    expect(connector.status,).toBe("open",);
    expect(seen,).toEqual(["connecting", "open",],);
  });

  test("connect rejects on pre-open drop and resets to closed", async () => {
    const sockets: FakeSocket[] = [];
    const connector = createTunnelConnector("ws://localhost:8080/t", {
      openSocket: () => {
        const socket = createFakeSocket();
        sockets.push(socket,);
        return socket;
      },
    },);
    const connected = connector.connect();
    sockets[0]?.drop();
    await expect(connected,).rejects.toBeInstanceOf(TunnelUnavailable,);
    expect(connector.status,).toBe("closed",);
  });

  test("openSocket throw surfaces as TunnelUnavailable", async () => {
    const connector = createTunnelConnector("ws://localhost:8080/t", {
      openSocket: () => {
        throw new Error("nope",);
      },
    },);
    await expect(connector.connect(),).rejects.toBeInstanceOf(TunnelUnavailable,);
  });

  test("health reflects the /health endpoint", async () => {
    const calls: string[] = [];
    const ok = createTunnelConnector("ws://localhost:8080/t", {
      fetchImpl: (async (url: unknown,) => {
        calls.push(String(url,),);
        return { ok: true, };
      }) as unknown as typeof fetch,
    },);
    expect(await ok.health(),).toBe(true,);
    expect(calls,).toEqual(["http://localhost:8080/t/health",],);

    const down = createTunnelConnector("ws://localhost:8080/t", {
      fetchImpl: (async () => {
        throw new Error("offline",);
      }) as unknown as typeof fetch,
    },);
    expect(await down.health(),).toBe(false,);

    const bad = createTunnelConnector("nota-url", {},);
    expect(await bad.health(),).toBe(false,);
  });
});

describe("tunnel-connector completion", () => {
  test("complete streams tokens and resolves the full text", async () => {
    const sockets: FakeSocket[] = [];
    const connector = createTunnelConnector("ws://localhost:8080/t", {
      openSocket: () => {
        const socket = createFakeSocket();
        sockets.push(socket,);
        return socket;
      },
    },);
    const connected = connector.connect();
    sockets[0]?.openIt();
    await connected;

    const tokens: string[] = [];
    const result = connector.complete("hello", { temperature: 0.5, }, (text,) => tokens.push(text,),);
    const sent = JSON.parse(sockets[0]?.sent[0] ?? "{}",);
    expect(sent.type,).toBe("complete",);
    expect(sent.prompt,).toBe("hello",);
    expect(sent.params,).toEqual({ temperature: 0.5, },);

    sockets[0]?.receive(JSON.stringify({ type: "token", id: sent.id, text: "Hel", },),);
    sockets[0]?.receive(JSON.stringify({ type: "token", id: sent.id, text: "lo", },),);
    sockets[0]?.receive("not-json{{{",);
    sockets[0]?.receive(JSON.stringify({ type: "token", id: 999, text: "ghost", },),);
    sockets[0]?.receive(JSON.stringify({ type: "done", id: sent.id, text: "Hello", },),);
    expect(await result,).toBe("Hello",);
    expect(tokens,).toEqual(["Hel", "lo",],);
  });

  test("complete throws when not connected", async () => {
    const connector = createTunnelConnector("ws://localhost:8080/t", {},);
    await expect(connector.complete("hi", undefined, () => {},),).rejects.toBeInstanceOf(
      TunnelUnavailable,
    );
  });

  test("server error frame rejects the pending request", async () => {
    const sockets: FakeSocket[] = [];
    const connector = createTunnelConnector("ws://localhost:8080/t", {
      openSocket: () => {
        const socket = createFakeSocket();
        sockets.push(socket,);
        return socket;
      },
    },);
    const connected = connector.connect();
    sockets[0]?.openIt();
    await connected;
    const result = connector.complete("hi", undefined, () => {},);
    const sent = JSON.parse(sockets[0]?.sent[0] ?? "{}",);
    sockets[0]?.receive(JSON.stringify({ type: "error", id: sent.id, message: "oom", },),);
    await expect(result,).rejects.toThrow("tunnel error: oom",);
  });

  test("disconnect rejects pending and closes without reconnect", async () => {
    const sockets: FakeSocket[] = [];
    const connector = createTunnelConnector("ws://localhost:8080/t", {
      openSocket: () => {
        const socket = createFakeSocket();
        sockets.push(socket,);
        return socket;
      },
    },);
    const connected = connector.connect();
    sockets[0]?.openIt();
    await connected;
    const result = connector.complete("hi", undefined, () => {},);
    connector.disconnect();
    await expect(result,).rejects.toBeInstanceOf(TunnelUnavailable,);
    expect(connector.status,).toBe("closed",);
    expect(sockets[0]?.closed,).toBe(true,);
    expect(sockets.length,).toBe(1,);
  });
});

describe("tunnel-connector reconnect", () => {
  test("drop schedules a capped backoff reconnect", async () => {
    const sockets: FakeSocket[] = [];
    const slept: number[] = [];
    const seen: TunnelStatus[] = [];
    const connector = createTunnelConnector("ws://localhost:8080/t", {
      openSocket: () => {
        const socket = createFakeSocket();
        sockets.push(socket,);
        return socket;
      },
      sleep: async (ms,) => {
        slept.push(ms,);
      },
      onStatus: (status,) => seen.push(status,),
    },);
    const connected = connector.connect();
    sockets[0]?.openIt();
    await connected;
    sockets[0]?.drop();
    await pump();
    expect(connector.status,).toBe("reconnecting",);
    expect(slept,).toEqual([500,],);
    expect(sockets.length,).toBe(2,);
    sockets[1]?.openIt();
    await pump();
    expect(seen,).toEqual(["connecting", "open", "reconnecting", "reconnecting", "open",],);
  });

  test("exhausted attempts fail and reject pending", async () => {
    const sockets: FakeSocket[] = [];
    const connector = createTunnelConnector("ws://localhost:8080/t", {
      openSocket: () => {
        const socket = createFakeSocket();
        sockets.push(socket,);
        return socket;
      },
      sleep: async () => {},
      maxAttempts: 1,
    },);
    const connected = connector.connect();
    sockets[0]?.openIt();
    await connected;
    const result = connector.complete("hi", undefined, () => {},);
    sockets[0]?.drop();
    await pump();
    expect(sockets.length,).toBe(2,);
    sockets[1]?.drop();
    await pump();
    expect(connector.status,).toBe("failed",);
    await expect(result,).rejects.toThrow("tunnel unreachable after retries",);
    await expect(connector.complete("again", undefined, () => {},),).rejects.toBeInstanceOf(
      TunnelUnavailable,
    );
  });
});
