// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the MessageBridge seam (spec §2.2, §4).
 *
 * Clock is injected — no real timers; adapters are in-memory stubs.
 */
import { describe, expect, test, } from "bun:test";
import type { AdapterMessage, ProtocolAdapter, } from "./adapter";
import { createMessageBridge, } from "./bridge";
import { createAdapterHealth, } from "./health";
import { createBridgeRegistry, } from "./registry";

type SendCapture = { target: string; message: Omit<AdapterMessage, "id" | "target"> };

function makeSendingAdapter(
  name: string,
  sent: SendCapture[],
  options: { failWith?: Error } = {},
): ProtocolAdapter {
  return {
    name,
    protocol: name,
    connect: async () => {},
    disconnect: async () => {},
    isConnected: () => true,
    isEncrypted: () => false,
    capabilities: () => [],
    sendMessage: async (target, message,) => {
      if (options.failWith) { throw options.failWith; }
      sent.push({ target, message, },);
      return `${name}-${sent.length}`;
    },
    onMessage: () => {},
    ownsTarget: (target,) => target.startsWith(`${name}:`,),
  };
}

function outbound(overrides: Partial<AdapterMessage> = {},): AdapterMessage {
  return {
    id: "local-1",
    author: "loop-lore",
    target: "matrix:@room:example.org",
    body: "hello",
    timestamp: 42,
    ...overrides,
  };
}

function inbound(id: string,): AdapterMessage {
  return { id, author: "@alice:example.org", target: "loop-lore", body: "hi", timestamp: 7, };
}

function setup(sent: SendCapture[],): ReturnType<typeof createMessageBridge> {
  const registry = createBridgeRegistry();
  registry.register(makeSendingAdapter("matrix", sent,),);
  return createMessageBridge(registry,);
}

describe("MessageBridge.send", () => {
  test("routes to the owning adapter and stamps an idempotency key", async () => {
    const sent: SendCapture[] = [];
    const bridge = setup(sent,);

    const result = await bridge.send("matrix:@room:example.org", outbound(),);
    expect(result.ok,).toBe(true,);
    if (result.ok) {
      expect(result.adapter,).toBe("matrix",);
      expect(result.id,).toBe("matrix-1",);
      expect(result.idempotencyKey,).toMatch(/[0-9a-f-]{16,}/,);
      expect(sent[0]!.message.idempotencyKey,).toBe(result.idempotencyKey,);
    }

    expect(sent,).toHaveLength(1,);
    expect(sent[0]!.target,).toBe("matrix:@room:example.org",);
  });

  test("preserves a caller-supplied idempotency key (retry semantics)", async () => {
    const sent: SendCapture[] = [];
    const bridge = setup(sent,);

    const result = await bridge.send("matrix:@room:example.org", outbound({ idempotencyKey: "retry-7", },),);
    expect(result.ok && result.idempotencyKey,).toBe("retry-7",);
    expect(sent[0]!.message.idempotencyKey,).toBe("retry-7",);
  });

  test("returns unknown_target and invokes neither gate nor adapter", async () => {
    const sent: SendCapture[] = [];
    const gated: AdapterMessage[] = [];
    const registry = createBridgeRegistry();
    registry.register(makeSendingAdapter("matrix", sent,),);
    const bridge = createMessageBridge(registry, {
      moderationGate: async (message,) => {
        gated.push(message,);
        return { allowed: true, };
      },
    },);

    expect(await bridge.send("irc:#nowhere", outbound(),),).toEqual({
      ok: false,
      code: "unknown_target",
      message: "no adapter owns target: irc:#nowhere",
    },);

    expect(gated,).toEqual([],);
    expect(sent,).toEqual([],);
  });

  test("invokes the moderation gate and short-circuits the send on block", async () => {
    const sent: SendCapture[] = [];
    const gated: AdapterMessage[] = [];
    const registry = createBridgeRegistry();
    registry.register(makeSendingAdapter("matrix", sent,),);
    const bridge = createMessageBridge(registry, {
      moderationGate: async (message,) => {
        gated.push(message,);
        return { allowed: false, reason: "nsfw", };
      },
    },);

    const result = await bridge.send("matrix:@room:example.org", outbound(),);
    expect(result,).toEqual({
      ok: false,
      code: "moderation_blocked",
      message: "moderation gate blocked send to matrix:@room:example.org",
      reason: "nsfw",
    },);

    expect(gated,).toHaveLength(1,);
    expect(gated[0]!.body,).toBe("hello",);
    expect(sent,).toEqual([],);
  });

  test("maps a throwing moderation gate to send_failed without throwing", async () => {
    const sent: SendCapture[] = [];
    const registry = createBridgeRegistry();
    registry.register(makeSendingAdapter("matrix", sent,),);
    const bridge = createMessageBridge(registry, {
      moderationGate: async () => {
        throw new Error("gate down",);
      },
    },);

    const result = await bridge.send("matrix:@room:example.org", outbound(),);
    expect(result.ok,).toBe(false,);
    expect(!result.ok && result.code,).toBe("send_failed",);
    if (!result.ok && result.code === "send_failed") {
      expect(result.message,).toContain("gate down",);
      expect((result.cause as Error).message,).toBe("gate down",);
    }

    expect(sent,).toEqual([],);
  });

  test("maps an adapter failure to send_failed with the cause", async () => {
    const sent: SendCapture[] = [];
    const registry = createBridgeRegistry();
    registry.register(makeSendingAdapter("matrix", sent, { failWith: new Error("boom",), },),);
    const bridge = createMessageBridge(registry,);

    const result = await bridge.send("matrix:@room:example.org", outbound(),);
    expect(result.ok,).toBe(false,);
    expect(!result.ok && result.code,).toBe("send_failed",);
    if (!result.ok && result.code === "send_failed") {
      expect(result.message,).toContain("boom",);
      expect((result.cause as Error).message,).toBe("boom",);
    }
  });
});

describe("MessageBridge inbound path", () => {
  test("dispatches received messages to the onMessage handler", () => {
    const bridge = setup([],);
    const got: AdapterMessage[] = [];
    bridge.onMessage((message,) => {
      got.push(message,);
    },);

    expect(bridge.receive("matrix", inbound("evt-1",),),).toBe(true,);
    expect(got,).toEqual([inbound("evt-1",),],);
  });

  test("onMessage replaces the previous handler", () => {
    const bridge = setup([],);
    const first: AdapterMessage[] = [];
    const second: AdapterMessage[] = [];
    bridge.onMessage((m,) => {
      first.push(m,);
    },);

    bridge.onMessage((m,) => {
      second.push(m,);
    },);

    bridge.receive("matrix", inbound("evt-2",),);
    expect(first,).toEqual([],);
    expect(second,).toHaveLength(1,);
  });

  test("drops duplicates per (adapter, protocol message id)", () => {
    const bridge = setup([],);
    const got: AdapterMessage[] = [];
    bridge.onMessage((m,) => {
      got.push(m,);
    },);

    expect(bridge.receive("matrix", inbound("evt-3",),),).toBe(true,);
    expect(bridge.receive("matrix", inbound("evt-3",),),).toBe(false,);
    expect(got,).toHaveLength(1,);

    // Same protocol id from a different adapter is a different message.
    expect(bridge.receive("xmpp", inbound("evt-3",),),).toBe(true,);
    expect(got,).toHaveLength(2,);
  });

  test("redelivers once the dedup TTL has expired", () => {
    let nowMs = 1_000;
    const registry = createBridgeRegistry();
    registry.register(makeSendingAdapter("matrix", [],),);
    const bridge = createMessageBridge(registry, {
      dedupTtlMs: 60_000,
      now: () => nowMs,
    },);

    const got: AdapterMessage[] = [];
    bridge.onMessage((m,) => {
      got.push(m,);
    },);

    expect(bridge.receive("matrix", inbound("evt-4",),),).toBe(true,);
    nowMs += 59_999;
    expect(bridge.receive("matrix", inbound("evt-4",),),).toBe(false,);
    nowMs += 2;
    expect(bridge.receive("matrix", inbound("evt-4",),),).toBe(true,);
    expect(got,).toHaveLength(2,);
  });

  test("the size-triggered sweep never evicts live entries", () => {
    const registry = createBridgeRegistry();
    registry.register(makeSendingAdapter("matrix", [],),);
    const bridge = createMessageBridge(registry, {
      dedupTtlMs: 3_600_000,
      now: () => 5_000,
    },);

    let delivered = 0;
    bridge.onMessage(() => {
      delivered++;
    },);

    // Cross DEDUP_SWEEP_THRESHOLD with unexpired entries; a pre-threshold
    // id must stay deduplicated — the sweep kept live keys.
    for (let i = 0; i < 1_100; i++) { bridge.receive("matrix", inbound(`evt-${i}`,),); }
    expect(delivered,).toBe(1_100,);
    expect(bridge.receive("matrix", inbound("evt-0",),),).toBe(false,);
  });
});

describe("MessageBridge health + rate-limit wiring", () => {
  test("returns rate_limited without invoking gate or adapter", async () => {
    const sent: SendCapture[] = [];
    const gated: AdapterMessage[] = [];
    const registry = createBridgeRegistry();
    registry.register(makeSendingAdapter("matrix", sent,),);
    const consumed: Array<[string, string, string,]> = [];
    const rateLimiter = {
      consume: (adapter: string, protocol: string, target: string,) => {
        consumed.push([adapter, protocol, target,],);
        return { ok: false as const, code: "rate_limited" as const, retryAfterMs: 2_500, };
      },
      observeRetryAfter: () => {},
      reset: () => {},
    };

    const bridge = createMessageBridge(registry, {
      moderationGate: async (message,) => {
        gated.push(message,);
        return { allowed: true, };
      },
      rateLimiter,
    },);

    const result = await bridge.send("matrix:@room:example.org", outbound(),);
    expect(result,).toEqual({
      ok: false,
      code: "rate_limited",
      message: "rate limited sending to matrix:@room:example.org on matrix",
      retryAfterMs: 2_500,
    },);

    expect(gated,).toEqual([],);
    expect(consumed,).toEqual([["matrix", "matrix", "matrix:@room:example.org",],],);
    expect(sent,).toEqual([],);
  });

  test("marks success on send and failure with the classified §10 code", async () => {
    const sent: SendCapture[] = [];
    const registry = createBridgeRegistry();
    registry.register(makeSendingAdapter("matrix", sent,),);
    registry.register(
      makeSendingAdapter("flaky", [], { failWith: new Error("connect timeout after 5s",), },),
    );

    const health = createAdapterHealth();
    const bridge = createMessageBridge(registry, { health, },);

    await bridge.send("matrix:@room:example.org", outbound(),);
    expect(health.get("matrix",)?.verdict,).toBe("ok",);

    await bridge.send("flaky:@room:example.org", outbound(),);
    expect(health.get("flaky",)?.verdict,).toBe("degraded",);
    expect(health.get("flaky",)?.consecutiveFailures,).toBe(1,);

    // Auth failures trip unhealthy with the auth_expired reason directly.
    registry.register(makeSendingAdapter("auth", [], { failWith: new Error("HTTP 403 forbidden",), },),);
    await bridge.send("auth:@room:example.org", outbound(),);
    const authed = health.get("auth",);
    expect(authed?.verdict,).toBe("unhealthy",);
    expect(authed?.reason,).toBe("auth_expired",);
    expect(health.isHealthy("auth",),).toBe(false,);
  });

  test("a second consecutive timeout escalates to unhealthy", async () => {
    const registry = createBridgeRegistry();
    registry.register(
      makeSendingAdapter("matrix", [], { failWith: new Error("request timeout",), },),
    );

    const health = createAdapterHealth();
    const bridge = createMessageBridge(registry, { health, },);

    await bridge.send("matrix:@room:example.org", outbound(),);
    await bridge.send("matrix:@room:example.org", outbound(),);
    expect(health.get("matrix",)?.verdict,).toBe("unhealthy",);
    expect(health.isHealthy("matrix",),).toBe(false,);
  });

  test("a successful receive recovers the adapter", () => {
    const registry = createBridgeRegistry();
    registry.register(makeSendingAdapter("matrix", [],),);
    const health = createAdapterHealth();
    const bridge = createMessageBridge(registry, { health, },);
    health.markFailure("matrix", "crash",);
    expect(health.isHealthy("matrix",),).toBe(false,);

    bridge.onMessage(() => {},);
    expect(bridge.receive("matrix", inbound("evt-9",),),).toBe(true,);
    expect(health.get("matrix",)?.verdict,).toBe("ok",);
  });
});

describe("MessageBridge inbound gate", () => {
  test("a not-ok verdict drops the message before dispatch", () => {
    const received: AdapterMessage[] = [];
    const gateCalls: string[] = [];
    const registry = createBridgeRegistry();
    registry.register(makeSendingAdapter("matrix", [],),);
    const bridge = createMessageBridge(registry, {
      inboundGate: (message,) => {
        gateCalls.push(message.id,);
        return message.author === "@alice:example.org"
          ? { ok: true, }
          : { ok: false, code: "inbound_blocked", message: "spam gate: blocked_sender", };
      },
    },);

    bridge.onMessage((message,) => {
      received.push(message,);
    },);

    expect(bridge.receive("matrix", inbound("evt-1",),),).toBe(true,);
    expect(bridge.receive("matrix", { ...inbound("evt-2",), author: "@spam:evil.example", },),).toBe(false,);
    expect(received.map((message,) => message.id),).toEqual(["evt-1",],);
    expect(gateCalls,).toEqual(["evt-1", "evt-2",],);
  });

  test("dedup short-circuits before the gate, and a block never marks success", () => {
    const gateCalls: string[] = [];
    const registry = createBridgeRegistry();
    registry.register(makeSendingAdapter("matrix", [],),);
    const health = createAdapterHealth();
    health.markFailure("matrix", "crash",);
    const bridge = createMessageBridge(registry, {
      health,
      inboundGate: (message,) => {
        gateCalls.push(message.id,);
        return { ok: false, code: "inbound_blocked", message: "blocked", };
      },
    },);

    bridge.onMessage(() => {},);

    expect(health.isHealthy("matrix",),).toBe(false,);
    expect(bridge.receive("matrix", inbound("evt-1",),),).toBe(false,);
    expect(bridge.receive("matrix", inbound("evt-1",),),).toBe(false,);
    expect(gateCalls,).toEqual(["evt-1",],);
    expect(health.isHealthy("matrix",),).toBe(false,);
  });
});
