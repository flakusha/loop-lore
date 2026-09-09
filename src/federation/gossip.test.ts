// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the mesh gossip driver.
 *
 * Clock and fetch are injected — no real timers, no network.
 */
import { describe, expect, test, } from "bun:test";
import type { FederationPeerTrustConfig, } from "../config/schema";
import {
  getGossipOrigins,
  getGossipService,
  GossipService,
  publicOriginOf,
  resetGossipService,
} from "./gossip";
import type { PeerFetch, } from "./peer-fetch";

function clock(startMs = 1_000_000,): { now: () => number; advance: (ms: number,) => void } {
  let t = startMs;
  return {
    now: () => t,
    advance: (ms: number,) => {
      t += ms;
    },
  };
}

interface StubHandler {
  body?: unknown;
  fail?: boolean;
  status?: number;
  deferred?: boolean;
}

function stubFetch(
  handlers: Record<string, StubHandler>,
  calls: { url: string; trust: FederationPeerTrustConfig | undefined }[] = [],
): { fetchImpl: PeerFetch; release: (url: string,) => void } {
  const gates = new Map<string, () => void>();
  const fetchImpl: PeerFetch = async (url, trust,) => {
    calls.push({ url, trust, },);
    const origin = url.replace(/\/api\/instance-state$/, "",);
    const handler = handlers[origin];
    if (!handler || handler.fail) {
      throw new Error(`unreachable: ${origin}`,);
    }
    if (handler.deferred) {
      await new Promise<void>((resolve,) => {
        gates.set(url, resolve,);
      },);
    }
    if (handler.status !== undefined && handler.status !== 200) {
      return { ok: false, status: handler.status, body: null, };
    }
    return { ok: true, status: 200, body: handler.body ?? {}, };
  };
  return {
    fetchImpl,
    release: (url: string,) => gates.get(url,)?.(),
  };
}

describe("publicOriginOf", () => {
  test("explicit publicOrigin wins", () => {
    const server = { host: "localhost", port: 3000, publicOrigin: "https://lore.example.com", };
    expect(publicOriginOf(server,),).toBe("https://lore.example.com",);
  });

  test("https heuristic when a cert is configured", () => {
    const server = { host: "localhost", port: 3000, tls: { key: "k", cert: "c", }, };
    expect(publicOriginOf(server,),).toBe("https://localhost:3000",);
  });

  test("http fallback otherwise", () => {
    const server = { host: "localhost", port: 3000, };
    expect(publicOriginOf(server,),).toBe("http://localhost:3000",);
  });
});

describe("GossipService — verdict policy", () => {
  test("seeds start pending, explicit config peers start trusted", () => {
    const c = clock();
    const svc = new GossipService({
      seeds: ["https://seed.example.com", "not-a-url",],
      trusted: ["https://peer.example.com",],
      trustByOrigin: {},
      selfOrigin: "http://localhost:3000",
      now: c.now,
    },);
    expect(svc.getPeer("https://seed.example.com",)?.state,).toBe("pending",);
    expect(svc.getPeer("https://peer.example.com",)?.state,).toBe("trusted",);
    expect(svc.origins(),).toHaveLength(2,);
    expect(svc.currentTick,).toBe(0,);
    svc.start();
    svc.stop();
  });
});

describe("GossipService — pollOnce", () => {
  test("alive peers heartbeat; dead peers go stale and sweep evicts them", async () => {
    const c = clock();
    const { fetchImpl, } = stubFetch({
      "https://alive.example.com": { body: { peers: [], }, },
      "https://dead.example.com": { fail: true, },
    },);
    const svc = new GossipService({
      seeds: ["https://alive.example.com", "https://dead.example.com",],
      trusted: [],
      trustByOrigin: {},
      selfOrigin: "http://localhost:3000",
      ttl: 1_000,
      now: c.now,
      fetchImpl,
    },);
    const first = await svc.pollOnce();
    expect(first,).toEqual({ tick: 1, polled: 2, alive: 1, discovered: 0, },);
    expect(svc.getPeer("https://alive.example.com",)?.lastSeq,).toBe(1,);

    c.advance(2_000,);
    const second = await svc.pollOnce();
    expect(second.alive,).toBe(1,);
    expect(svc.getPeer("https://dead.example.com",),).toBeUndefined();
    expect(svc.getPeer("https://alive.example.com",)?.lastSeq,).toBe(2,);
    svc.stop();
  });

  test("non-200 responses are misses, not heartbeats", async () => {
    const c = clock();
    const { fetchImpl, } = stubFetch({
      "https://flaky.example.com": { status: 503, },
    },);
    const svc = new GossipService({
      seeds: ["https://flaky.example.com",],
      trusted: [],
      trustByOrigin: {},
      selfOrigin: "http://localhost:3000",
      now: c.now,
      fetchImpl,
    },);
    const summary = await svc.pollOnce();
    expect(summary,).toEqual({ tick: 1, polled: 1, alive: 0, discovered: 0, },);
    expect(svc.getPeer("https://flaky.example.com",)?.lastSeq,).toBe(-1,);
    svc.stop();
  });

  test("stale async responses from an older tick are rejected", async () => {
    const c = clock();
    const handlers: Record<string, StubHandler> = {
      "https://slow.example.com": { body: { peers: [], }, deferred: true, },
    };
    const { fetchImpl, release, } = stubFetch(handlers,);
    const svc = new GossipService({
      seeds: ["https://slow.example.com",],
      trusted: [],
      trustByOrigin: {},
      selfOrigin: "http://localhost:3000",
      now: c.now,
      fetchImpl,
    },);
    const slowUrl = "https://slow.example.com/api/instance-state";
    const poll1 = svc.pollOnce();
    // Let poll 1 issue its request, then run a full fast poll 2 first.
    await Promise.resolve();
    const slow = handlers["https://slow.example.com"];
    if (!slow) { throw new Error("stub misconfigured",); }
    slow.deferred = false;
    const summary2 = await svc.pollOnce();
    expect(summary2.tick,).toBe(2,);
    release(slowUrl,);
    const summary1 = await poll1;
    expect(summary1.tick,).toBe(1,);
    // The late tick-1 heartbeat must not rewind the tick-2 state.
    expect(svc.getPeer("https://slow.example.com",)?.lastSeq,).toBe(2,);
    svc.stop();
  });

  test("gossip-learned peers stay pending; self/invalid/capped entries skipped", async () => {
    const c = clock();
    const many = Array.from({ length: 200, }, (_, i,) => `https://peer-${i}.example.com`,);
    const { fetchImpl, } = stubFetch({
      "https://seed.example.com": {
        body: {
          peers: [
            "https://new.example.com",
            "http://localhost:3000",
            "gopher://bad.example.com",
            "https://seed.example.com",
            ...many,
          ],
        },
      },
    },);
    const svc = new GossipService({
      seeds: ["https://seed.example.com",],
      trusted: [],
      trustByOrigin: {},
      selfOrigin: "http://localhost:3000",
      maxPayloadPeers: 8,
      now: c.now,
      fetchImpl,
    },);
    const summary = await svc.pollOnce();
    expect(summary.discovered,).toBeGreaterThan(0,);
    expect(summary.discovered,).toBeLessThanOrEqual(8,);
    expect(svc.getPeer("https://new.example.com",)?.state,).toBe("pending",);
    expect(svc.getPeer("http://localhost:3000",),).toBeUndefined();
    expect(svc.getPeer("gopher://bad.example.com",),).toBeUndefined();
    svc.stop();
  });

  test("table-size cap stops discovery", async () => {
    const c = clock();
    const many = Array.from({ length: 10, }, (_, i,) => `https://p-${i}.example.com`,);
    const { fetchImpl, } = stubFetch({
      "https://seed.example.com": { body: { peers: many, }, },
    },);
    const svc = new GossipService({
      seeds: ["https://seed.example.com",],
      trusted: [],
      trustByOrigin: {},
      selfOrigin: "http://localhost:3000",
      maxTableSize: 3,
      now: c.now,
      fetchImpl,
    },);
    const summary = await svc.pollOnce();
    expect(summary.discovered,).toBe(2,);
    expect(svc.origins(),).toHaveLength(3,);
    svc.stop();
  });

  test("per-peer trust overrides reach the fetch seam", async () => {
    const c = clock();
    const calls: { url: string; trust: FederationPeerTrustConfig | undefined }[] = [];
    const { fetchImpl, } = stubFetch({ "https://peer.example.com": { body: {}, }, }, calls,);
    const trust = { caBundle: "PEM-BUNDLE", };
    const svc = new GossipService({
      seeds: ["https://peer.example.com",],
      trusted: ["https://peer.example.com",],
      trustByOrigin: { "https://peer.example.com": trust, },
      selfOrigin: "http://localhost:3000",
      now: c.now,
      fetchImpl,
    },);
    await svc.pollOnce();
    expect(calls[0]?.trust,).toBe(trust,);
    svc.stop();
  });
});

describe("gossip singleton", () => {
  test("origins empty before init; service shared after init", () => {
    resetGossipService();
    expect(getGossipOrigins(),).toEqual([],);
    const a = getGossipService({
      seeds: ["https://a.example.com",],
      trusted: [],
      trustByOrigin: {},
      selfOrigin: "http://localhost:3000",
    },);
    const b = getGossipService({
      seeds: ["https://b.example.com",],
      trusted: [],
      trustByOrigin: {},
      selfOrigin: "http://localhost:3000",
    },);
    expect(a,).toBe(b,);
    expect(getGossipOrigins(),).toEqual(["https://a.example.com",],);
    resetGossipService();
    expect(getGossipOrigins(),).toEqual([],);
  });
});
