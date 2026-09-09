// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/gossip.ts — Mesh gossip loop over the PeerTable primitive.
//
// The PeerTable (src/transport/peer-table.ts) stores membership; this module
// drives it: each poll fetches every known peer's `/api/instance-state`
// advertisement, records heartbeats with per-poll sequence numbers (late or
// replayed responses for an older tick are rejected), and discovers new peers
// from advertised membership lists. Peer fetches honor per-peer TLS trust
// overrides (custom CA bundles) from `config.federation.peers`.
//
// Verdict policy (no self-reported identity is trusted):
// - Origins listed in `config.federation.peers` are explicit admin trust → `trusted`.
// - Config `seeds` and gossip-learned origins stay `pending` (liveness only).
// - Promotion of a `pending` peer to `trusted` requires an explicit config
//   entry today; signature-based promotion is future work (actor-key infra).

import type { FederationPeerTrustConfig, ServerConfig, } from "../config/schema";
import { PeerTable, type PeerEntry, } from "../transport/peer-table";

/** Per-poll fetch timeout for peer advertisements. */
const POLL_TIMEOUT_MS = 5_000;
/** Cap on membership entries accepted from one advertisement. */
const MAX_PAYLOAD_PEERS = 128;
/** Cap on total table size (bounds memory against hostile peer lists). */
const MAX_TABLE_SIZE = 1_024;

/** Minimal shape of a peer `/api/instance-state` advertisement. */
export interface InstanceAdvertisement {
  /** Mesh origins known to the advertising peer. */
  peers?: unknown;
}

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

/** Fetch implementation seam (injectable for tests). */
export type GossipFetch = (
  url: string,
  trust: FederationPeerTrustConfig | undefined,
) => Promise<{ ok: boolean; status: number; body: unknown }>;

/**
 * Fetch a URL with an optional per-peer CA bundle and a bounded timeout.
 * SPKI pins / mTLS are NOT enforced here — Bun's fetch surface exposes no
 * peer-certificate handle for pin comparison; custom-CA trust is the
 * enforceable subset today.
 * @param url
 * @param trust
 * @param timeoutMs
 * @returns Status + parsed JSON body (null when unparseable).
 */
export async function fetchWithPeerTrust(
  url: string,
  trust: FederationPeerTrustConfig | undefined,
  timeoutMs: number = POLL_TIMEOUT_MS,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs,);
  try {
    const init: RequestInit & { tls?: { ca?: string[] } } = { signal: controller.signal, };
    if (trust?.caBundle) {
      init.tls = { ca: [trust.caBundle,], };
    }
    const res = await fetch(url, init,);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { ok: res.ok, status: res.status, body, };
  } catch {
    return { ok: false, status: 0, body: null, };
  } finally {
    clearTimeout(timer,);
  }
}

/**
 * Canonicalize a peer origin to `URL.origin` (lowercased host, no path).
 * @param raw
 * @returns Canonical origin, or null when not an http(s) URL.
 */
export function canonicalOrigin(raw: unknown,): string | null {
  if (typeof raw !== "string") { return null; }
  let url: URL;
  try {
    url = new URL(raw,);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") { return null; }
  if (url.username !== "" || url.password !== "") { return null; }
  if (url.hostname === "") { return null; }
  return url.origin;
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
  /** Monotonic clock (injectable for tests). */
  now?: () => number;
  /** Fetch seam (injectable for tests). */
  fetchImpl?: GossipFetch;
}

/** Mesh gossip driver: polls advertisements, feeds the peer table. */
export class GossipService {
  private readonly table: PeerTable;
  private readonly trustByOrigin: Record<string, FederationPeerTrustConfig | undefined>;
  private readonly selfOrigin: string;
  private readonly fetchImpl: GossipFetch;
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
    this.fetchImpl = opts.fetchImpl ??
      ((url: string, trust: FederationPeerTrustConfig | undefined,) =>
        fetchWithPeerTrust(url, trust,));
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
    return this.table.listPeers().map((p,) => p.origin,);
  }

  /** Get a peer entry by canonical origin. */
  getPeer(origin: string,): PeerEntry | undefined {
    return this.table.getPeer(origin,);
  }

  /**
   * One gossip round: fetch every known peer's advertisement, record
   * heartbeats keyed by this poll's tick (stale async responses from an
   * older tick are rejected by the table), and discover advertised peers.
   * @returns Per-poll summary.
   */
  async pollOnce(): Promise<GossipPollSummary> {
    this.tick += 1;
    const tick = this.tick;
    const known = this.table.listPeers();
    let alive = 0;
    let discovered = 0;
    await Promise.all(known.map(async (peer,) => {
      let body: unknown = null;
      let ok = false;
      try {
        // A dead peer must never abort the round — misses just go stale.
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
      if (!Array.isArray(advertised)) { return; }
      for (const raw of advertised.slice(0, MAX_PAYLOAD_PEERS,)) {
        const origin = canonicalOrigin(raw,);
        if (origin === null || origin === this.selfOrigin) { continue; }
        if (this.table.getPeer(origin,) !== undefined) { continue; }
        if (this.table.size >= MAX_TABLE_SIZE) { break; }
        this.table.discoverPeer(origin,);
        discovered += 1;
      }
    },),);
    this.table.sweep();
    return { tick, polled: known.length, alive, discovered, };
  }
}

/** Public origin of this instance (proxy-aware). */
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
