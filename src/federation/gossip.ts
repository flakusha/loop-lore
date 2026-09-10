// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/gossip.ts — Mesh gossip loop over the PeerTable primitive.
//
// The PeerTable (src/transport/peer-table.ts) stores membership; this module
// drives it: each poll fetches every known peer's `/api/instance-state`
// advertisement, records heartbeats with per-poll sequence numbers (late or
// replayed responses for an older tick are rejected), and discovers new peers
// from advertised membership lists.
//
// Verdict policy (no self-reported identity is trusted):
// - Origins listed in `config.federation.peers` are explicit admin trust → `trusted`.
// - Config `seeds` and gossip-learned origins stay `pending` (liveness only).
// - Promotion of a `pending` peer to `trusted` requires an explicit config
//   entry today; signature-based promotion is future work (actor-key infra).

import type { FederationPeerTrustConfig, ServerConfig, } from "../config/schema";
import { type PeerEntry, PeerTable, } from "../transport/peer-table";
import {
  canonicalOrigin,
  fetchPeerAdvertisement,
  type InstanceAdvertisement,
  type PeerFetch,
} from "./peer-fetch";

/** Cap on membership entries accepted from one advertisement. */
const MAX_PAYLOAD_PEERS = 128;
/** Cap on total table size (bounds memory against hostile peer lists). */
const MAX_TABLE_SIZE = 1_024;

/** Result of one gossip poll across all known peers. */
export interface GossipPollSummary {
  /** Poll tick (monotonic per service). */
  tick: number;
  /** Peers contacted. */
  polled: number;
  /** Peers that answered 200 with a parseable body. */
  alive: number;
  /** New origins learned this poll. */
  discovered: number;
}

/** Options for constructing a GossipService. */
export interface GossipServiceOptions {
  /** Seed origins (pending trust). */
  seeds: string[];
  /** Explicitly trusted origins (from `config.federation.peers`). */
  trusted: string[];
  /** Per-origin TLS trust overrides, keyed by canonical origin. */
  trustByOrigin?: Record<string, FederationPeerTrustConfig | undefined>;
  /** This instance's own origin (never gossiped back to itself). */
  selfOrigin: string;
  /** Heartbeat TTL in ms. */
  ttl?: number;
  /** Cap on membership entries accepted per advertisement (tests). */
  maxPayloadPeers?: number;
  /** Cap on total table size (tests). */
  maxTableSize?: number;
  /** Monotonic clock (injectable for tests). */
  now?: () => number;
  /** Fetch seam (injectable for tests). */
  fetchImpl?: PeerFetch;
}

/** Mesh gossip driver: polls advertisements, feeds the peer table. */
export class GossipService {
  private readonly table: PeerTable;
  private readonly trustByOrigin: Record<string, FederationPeerTrustConfig | undefined>;
  private readonly selfOrigin: string;
  private readonly fetchImpl: PeerFetch;
  private readonly maxPayloadPeers: number;
  private readonly maxTableSize: number;
  private tick = 0;

  /** @param opts */
  constructor(opts: GossipServiceOptions,) {
    this.table = new PeerTable({
      seeds: opts.seeds.flatMap((s,) => {
        const origin = canonicalOrigin(s,);
        return origin === null ? [] : [origin,];
      },),
      ttl: opts.ttl,
      now: opts.now,
    },);
    for (const origin of opts.trusted) {
      const canonical = canonicalOrigin(origin,);
      if (canonical !== null) { this.table.trustPeer(canonical,); }
    }
    this.trustByOrigin = opts.trustByOrigin ?? {};
    this.selfOrigin = opts.selfOrigin;
    this.maxPayloadPeers = opts.maxPayloadPeers ?? MAX_PAYLOAD_PEERS;
    this.maxTableSize = opts.maxTableSize ?? MAX_TABLE_SIZE;
    this.fetchImpl = opts.fetchImpl ?? fetchPeerAdvertisement;
  }

  /** Start the table eviction sweep. Idempotent. */
  start(): void {
    this.table.start();
  }

  /** Stop the table eviction sweep. Idempotent. */
  stop(): void {
    this.table.stop();
  }

  /** Current poll tick (monotonic). */
  get currentTick(): number {
    return this.tick;
  }

  /** Canonical origins of all known peers (for instance-state exposure). */
  origins(): string[] {
    return this.table.listPeers().map((p,) => p.origin);
  }

  /**
   * Get a peer entry by canonical origin.
   * @param origin
   */
  getPeer(origin: string,): PeerEntry | undefined {
    return this.table.getPeer(origin,);
  }

  /**
   * One gossip round: fetch every known peer's advertisement, record
   * heartbeats keyed by this poll's tick, and discover advertised peers.
   * Per-peer misses never abort the round — they just go stale.
   * @returns Per-poll summary.
   */
  async pollOnce(): Promise<GossipPollSummary> {
    this.tick += 1;
    const tick = this.tick;
    const known = this.table.listPeers();
    let alive = 0;
    let discovered = 0;
    // allSettled: a throwing custom fetchImpl still resolves the round
    // (the default seam never throws, but injected ones may).
    await Promise.allSettled(known.map(async (peer,) => {
      let body: unknown = null;
      let ok = false;
      try {
        const res = await this.fetchImpl(
          `${peer.origin}/api/instance-state`,
          this.trustByOrigin[peer.origin],
        );
        body = res.body;
        ok = res.ok;
      } catch {
        return;
      }
      if (!ok) { return; }
      if (!this.table.recordHeartbeat(peer.origin, tick,)) { return; }
      alive += 1;
      const advertised = (body as InstanceAdvertisement | null)?.peers;
      if (!Array.isArray(advertised,)) { return; }
      for (const raw of advertised.slice(0, this.maxPayloadPeers,)) {
        const origin = canonicalOrigin(raw,);
        if (origin === null || origin === this.selfOrigin) { continue; }
        if (this.table.getPeer(origin,) !== undefined) { continue; }
        if (this.table.size >= this.maxTableSize) { break; }
        this.table.discoverPeer(origin,);
        discovered += 1;
      }
    },),);
    this.table.sweep();
    return { tick, polled: known.length, alive, discovered, };
  }
}

/**
 * Public origin of this instance (proxy-aware).
 * @param server
 */
export function publicOriginOf(server: ServerConfig,): string {
  return server.publicOrigin ??
    `${server.tls?.cert ? "https" : "http"}://${server.host}:${server.port}`;
}

let singleton: GossipService | null = null;

/**
 * Process-wide gossip service, created from federation config on first use.
 * @param seeds
 * @param trusted
 * @param trustByOrigin
 * @param selfOrigin
 * @param ttl
 * @param opts
 * @param opts.seeds
 * @param opts.trusted
 * @param opts.trustByOrigin
 * @param opts.selfOrigin
 * @param opts.ttl
 */
export function getGossipService(opts: {
  seeds: string[];
  trusted: string[];
  trustByOrigin: Record<string, FederationPeerTrustConfig | undefined>;
  selfOrigin: string;
  ttl?: number;
},): GossipService {
  singleton ??= new GossipService(opts,);
  return singleton;
}

/** Canonical origins of known peers, or [] when the service never started. */
export function getGossipOrigins(): string[] {
  return singleton?.origins() ?? [];
}

/** Drop the process-wide service (tests only). */
export function resetGossipService(): void {
  singleton?.stop();
  singleton = null;
}
