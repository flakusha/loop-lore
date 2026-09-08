// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Mesh peer table — discovery, heartbeat, eviction, and replay protection.
 *
 * Maintains a table of known peers seeded from `config.federation.seeds` and
 * discovered via instance-state advertisement. Peers are evicted when their
 * heartbeat expires (TTL). Replay attacks are rejected by tracking the
 * highest sequence number per peer; a stale or duplicate heartbeat is dropped.
 *
 * This is the gossip primitive: the transport layer (ProtocolHandler or a
 * swappable transport) calls `recordHeartbeat` on each inbound peer message
 * and `discoverPeer` when a new peer origin is learned. The table does NOT
 * trust a peer's self-reported identity — a verdict (signature/ack) is
 * required before a peer transitions from `pending` to `trusted`.
 */

/** Coarse liveness verdict for a peer. */
export type PeerState = "pending" | "trusted" | "dead";

/** A peer entry in the mesh table. */
export interface PeerEntry {
  /** Peer origin URL (scheme + host[:port]). */
  origin: string;
  /** Current liveness verdict. */
  state: PeerState;
  /** Last heartbeat timestamp (ms since epoch). */
  lastSeen: number;
  /** Highest sequence number accepted from this peer (replay protection). */
  lastSeq: number;
  /** Heartbeat TTL in ms; peers silent longer than this are evicted. */
  ttl: number;
}

/** Options for constructing a peer table. */
export interface PeerTableOptions {
  /** Seed origins to bootstrap discovery from. */
  seeds: string[];
  /** Heartbeat TTL in ms (default 30_000). */
  ttl?: number;
  /** Eviction sweep interval in ms (default 10_000). */
  sweepInterval?: number;
  /** Monotonic clock function (injectable for tests). */
  now?: () => number;
}

/** Default heartbeat TTL: 30 seconds. */
const DEFAULT_TTL = 30_000;
/** Default eviction sweep: 10 seconds. */
const DEFAULT_SWEEP = 10_000;

/**
 * Mesh peer table with seed-based discovery, heartbeat eviction, and replay
 * protection. Peers start `pending`; only a verdict promotes them to `trusted`.
 */
export class PeerTable {
  private readonly peers = new Map<string, PeerEntry>();
  private readonly ttl: number;
  private readonly now: () => number;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private sweepInterval: number;
  private started = false;

  /** @param opts */
  constructor(opts: PeerTableOptions) {
    this.ttl = opts.ttl ?? DEFAULT_TTL;
    this.now = opts.now ?? (() => Date.now());
    this.sweepInterval = opts.sweepInterval ?? DEFAULT_SWEEP;
    for (const seed of opts.seeds) {
      this.peers.set(seed, {
        origin: seed,
        state: "pending",
        lastSeen: this.now(),
        lastSeq: -1,
        ttl: this.ttl,
      });
    }
  }

  /** Start the eviction sweep timer. Idempotent. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.sweepTimer = setInterval(() => this.sweep(), this.sweepInterval);
  }

  /** Stop the eviction sweep timer. Idempotent. */
  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.sweepTimer !== null) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /** Discover a new peer origin. No-op if already known. */
  discoverPeer(origin: string): void {
    if (this.peers.has(origin)) return;
    this.peers.set(origin, {
      origin,
      state: "pending",
      lastSeen: this.now(),
      lastSeq: -1,
      ttl: this.ttl,
    });
  }

  /**
   * Promote a peer from `pending` to `trusted` (verdict enforced).
   * Unknown peers are discovered first, then promoted.
   */
  trustPeer(origin: string): void {
    this.discoverPeer(origin);
    const peer = this.peers.get(origin);
    if (peer) peer.state = "trusted";
  }

  /**
   * Record an inbound heartbeat with replay protection.
   * @returns `true` if accepted (seq > lastSeq), `false` if stale/replayed.
   */
  recordHeartbeat(origin: string, seq: number): boolean {
    this.discoverPeer(origin);
    const peer = this.peers.get(origin);
    if (!peer) return false;
    if (seq <= peer.lastSeq) return false;
    peer.lastSeq = seq;
    peer.lastSeen = this.now();
    if (peer.state === "dead") peer.state = "pending";
    return true;
  }

  /** Evict peers whose heartbeat has expired (lastSeen + ttl < now). */
  sweep(): number {
    const now = this.now();
    let evicted = 0;
    for (const [origin, peer] of this.peers) {
      if (now - peer.lastSeen > peer.ttl) {
        peer.state = "dead";
        this.peers.delete(origin);
        evicted++;
      }
    }
    return evicted;
  }

  /** Get a snapshot of all known peers (defensive copy). */
  listPeers(): PeerEntry[] {
    return Array.from(this.peers.values()).map((p) => ({ ...p }));
  }

  /** Get a single peer by origin. */
  getPeer(origin: string): PeerEntry | undefined {
    const peer = this.peers.get(origin);
    return peer ? { ...peer } : undefined;
  }

  /** Number of known peers. */
  get size(): number {
    return this.peers.size;
  }
}
