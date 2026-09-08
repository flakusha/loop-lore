// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the mesh peer table — discovery, heartbeat eviction, replay
 * protection, and trust promotion.
 *
 * Uses an injectable clock for deterministic TTL/eviction testing. Timer
 * lifecycle is tested with fake timers (vi.useFakeTimers) — no real waits.
 */
import { afterEach, describe, expect, test, vi } from "bun:test";
import { PeerTable } from "./peer-table";

let clock = 0;
function resetClock() {
  clock = 0;
}
function advance(ms: number) {
  clock += ms;
}

afterEach(() => resetClock());

describe("PeerTable — seed discovery", () => {
  test("seeds are loaded as pending peers", () => {
    const table = new PeerTable({ seeds: ["http://a:3000", "http://b:3000"], now: () => clock });
    expect(table.size).toBe(2);
    const peers = table.listPeers();
    expect(peers.every((p) => p.state === "pending")).toBe(true);
    expect(peers.map((p) => p.origin).sort()).toEqual(["http://a:3000", "http://b:3000"]);
  });

  test("empty seeds yields empty table", () => {
    const table = new PeerTable({ seeds: [], now: () => clock });
    expect(table.size).toBe(0);
  });

  test("discoverPeer adds a new pending peer", () => {
    const table = new PeerTable({ seeds: [], now: () => clock });
    table.discoverPeer("http://c:3000");
    expect(table.size).toBe(1);
    expect(table.getPeer("http://c:3000")?.state).toBe("pending");
  });

  test("discoverPeer is idempotent for known peers", () => {
    const table = new PeerTable({ seeds: ["http://a:3000"], now: () => clock });
    table.discoverPeer("http://a:3000");
    expect(table.size).toBe(1);
  });
});

describe("PeerTable — trust promotion", () => {
  test("trustPeer promotes a pending peer to trusted", () => {
    const table = new PeerTable({ seeds: ["http://a:3000"], now: () => clock });
    table.trustPeer("http://a:3000");
    expect(table.getPeer("http://a:3000")?.state).toBe("trusted");
  });

  test("trustPeer discovers unknown peers then promotes", () => {
    const table = new PeerTable({ seeds: [], now: () => clock });
    table.trustPeer("http://new:3000");
    expect(table.size).toBe(1);
    expect(table.getPeer("http://new:3000")?.state).toBe("trusted");
  });
});

describe("PeerTable — heartbeat + replay protection", () => {
  test("recordHeartbeat accepts monotonically increasing seq", () => {
    const table = new PeerTable({ seeds: ["http://a:3000"], now: () => clock });
    expect(table.recordHeartbeat("http://a:3000", 1)).toBe(true);
    expect(table.recordHeartbeat("http://a:3000", 2)).toBe(true);
    expect(table.recordHeartbeat("http://a:3000", 10)).toBe(true);
  });

  test("recordHeartbeat rejects stale (lower) seq — replay protection", () => {
    const table = new PeerTable({ seeds: ["http://a:3000"], now: () => clock });
    table.recordHeartbeat("http://a:3000", 5);
    expect(table.recordHeartbeat("http://a:3000", 4)).toBe(false);
    expect(table.recordHeartbeat("http://a:3000", 5)).toBe(false);
  });

  test("recordHeartbeat rejects equal seq (duplicate)", () => {
    const table = new PeerTable({ seeds: ["http://a:3000"], now: () => clock });
    table.recordHeartbeat("http://a:3000", 3);
    expect(table.recordHeartbeat("http://a:3000", 3)).toBe(false);
  });

  test("recordHeartbeat discovers unknown peers", () => {
    const table = new PeerTable({ seeds: [], now: () => clock });
    table.recordHeartbeat("http://new:3000", 1);
    expect(table.size).toBe(1);
    expect(table.getPeer("http://new:3000")?.lastSeq).toBe(1);
  });

  test("recordHeartbeat revives a dead peer to pending", () => {
    const table = new PeerTable({ seeds: ["http://a:3000"], ttl: 100, now: () => clock });
    table.recordHeartbeat("http://a:3000", 1);
    advance(200);
    table.sweep();
    expect(table.getPeer("http://a:3000")?.state ?? "dead").toBe("dead");
    expect(table.recordHeartbeat("http://a:3000", 2)).toBe(true);
    expect(table.getPeer("http://a:3000")?.state).toBe("pending");
  });
});

describe("PeerTable — eviction sweep", () => {
  test("sweep evicts peers past TTL", () => {
    const table = new PeerTable({ seeds: ["http://a:3000", "http://b:3000"], ttl: 100, now: () => clock });
    advance(150);
    const evicted = table.sweep();
    expect(evicted).toBe(2);
    expect(table.size).toBe(0);
  });

  test("sweep retains peers within TTL", () => {
    const table = new PeerTable({ seeds: ["http://a:3000"], ttl: 1000, now: () => clock });
    advance(500);
    const evicted = table.sweep();
    expect(evicted).toBe(0);
    expect(table.size).toBe(1);
  });

  test("sweep evicts only expired peers (mixed)", () => {
    const table = new PeerTable({ seeds: ["http://a:3000", "http://b:3000"], ttl: 100, now: () => clock });
    advance(50);
    table.recordHeartbeat("http://a:3000", 1);
    advance(80);
    const evicted = table.sweep();
    expect(evicted).toBe(1);
    expect(table.getPeer("http://a:3000")).toBeDefined();
    expect(table.getPeer("http://b:3000")).toBeUndefined();
  });
});

describe("PeerTable — start/stop timer (fake timers)", () => {
  test("start triggers periodic eviction via setInterval", () => {
    vi.useFakeTimers();
    try {
      const table = new PeerTable({ seeds: ["http://a:3000"], ttl: 50, sweepInterval: 30, now: () => clock });
      table.start();
      advance(100);
      vi.advanceTimersByTime(30);
      expect(table.size).toBe(0);
      table.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  test("start is idempotent", () => {
    vi.useFakeTimers();
    try {
      const table = new PeerTable({ seeds: [], now: () => clock });
      table.start();
      table.start();
      table.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  test("stop is idempotent", () => {
    const table = new PeerTable({ seeds: [], now: () => clock });
    table.stop();
    table.start();
    table.stop();
    table.stop();
  });
});

describe("PeerTable — defensive copies", () => {
  test("listPeers returns copies (mutation safe)", () => {
    const table = new PeerTable({ seeds: ["http://a:3000"], now: () => clock });
    const peers = table.listPeers();
    const first = peers[0];
    if (first) first.state = "dead";
    expect(table.getPeer("http://a:3000")?.state).toBe("pending");
  });

  test("getPeer returns a copy (mutation safe)", () => {
    const table = new PeerTable({ seeds: ["http://a:3000"], now: () => clock });
    const peer = table.getPeer("http://a:3000");
    if (peer) peer.state = "dead";
    expect(table.getPeer("http://a:3000")?.state).toBe("pending");
  });
});
