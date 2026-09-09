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
  canonicalOrigin,
  getGossipOrigins,
  getGossipService,
  GossipService,
  resetGossipService,
  type GossipFetch,
} from "./gossip";

function clock(startMs = 1_000_000,): { now: () => number; advance: (ms: number) => void } {
  let t = startMs;
  return {
    now: () => t,
    advance: (ms: number,) => {
      t += ms;
    },
  };
}

function stubFetch(
  handlers: Record<string, { body?: unknown; fail?: boolean; deferred?: boolean }>,
  calls: { url: string; trust: FederationPeerTrustConfig | undefined }[] = [],
): { fetchImpl: GossipFetch; release: (url: string) => void } {
  const gates = new Map<string, () => void>();
  const fetchImpl: GossipFetch = async (url, trust,) => {
    calls.push({ url, trust, });
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
    return { ok: true, status: 200, body: handler.body ?? {}, };
  };
  return {
    fetchImpl,
    release: (url: string,) => gates.get(url)?.(),
  };
}

describe("canonicalOrigin", () => {
  test("canonicalizes case and strips paths", () => {
    expect(canonicalOrigin("HTTPS://Example.COM:8443/some/path",),).toBe("https://example.com:8443",);
  });

  test("rejects non-http schemes, credentials, and garbage", () => {
    expect(canonicalOrigin("gopher://example.com",),).toBeNull();
    expect(canonicalOrigin("https://user:pass@example.com",),).toBeNull();
    expect(canonicalOrigin("not a url",),).toBeNull();
    expect(canonicalOrigin(42,),).toBeNull();
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

  test("stale async responses from an older tick are rejected", async () => {
    const c = clock();
    const handlers = {
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
    handlers["https://slow.example.com"].deferred = false;
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
      now: c.now,
      fetchImpl,
    },);
    const summary = await svc.pollOnce();
    expect(summary.discovered,).toBeGreaterThan(0,);
    expect(summary.discovered,).toBeLessThanOrEqual(128,);
    expect(svc.getPeer("https://new.example.com",)?.state,).toBe("pending",);
    expect(svc.getPeer("http://localhost:3000",),).toBeUndefined();
    expect(svc.getPeer("gopher://bad.example.com",),).toBeUndefined();
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
