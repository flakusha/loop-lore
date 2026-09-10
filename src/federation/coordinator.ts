// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/coordinator.ts — Coordinator role: peer registry + resync
// pass over the mesh knowledge tables. Negotiation lives in ./negotiation.
//
// Decision (mesh-coordinator worktree): the coordinator runs as a role of the
// loop-lore server, not a separate app — registry tables live in the main
// schema (part 020), negotiation runs in-process, and resync rides the cron
// scheduler. Quota and encrypted-sharing phases build on this registry.
// Metadata/control plane only — plaintext content never touches these paths.

import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import type { DB, } from "../db/schema";
import { safeJsonStringify, } from "../utils/safe-json";
import {
  canonicalOrigin,
  fetchPeerAdvertisement,
  type InstanceAdvertisement,
  type PeerFetch,
} from "./peer-fetch";

/** Registry states for a known peer. */
export const PEER_STATES = ["pending", "trusted", "suspended",] as const;
/** Registry state. */
export type PeerState = (typeof PEER_STATES)[number];

/** Summary of one resync pass over trusted peers. */
export interface ResyncSummary {
  /** Trusted peers checked. */
  checked: number;
  /** Peers that answered 200 with a parseable body. */
  alive: number;
}

/**
 * Insert a peer or refresh its row when already known.
 * @param database
 * @param peer
 * @returns Canonical origin stored.
 */
export async function upsertPeer(
  database: Kysely<DB>,
  peer: {
    origin: string;
    state?: PeerState;
    capabilities?: string[];
    capacityBytes?: number | null;
  },
): Promise<string> {
  const origin = canonicalOrigin(peer.origin,);
  if (origin === null) { throw new Error(`invalid peer origin: ${peer.origin}`,); }
  const encoded = safeJsonStringify(peer.capabilities ?? [],);
  if (!encoded.ok) { throw new Error("peer capabilities not serializable",); }
  const row = {
    origin,
    state: peer.state ?? "pending",
    capabilities: encoded.value,
    capacity_bytes: peer.capacityBytes ?? null,
  };
  await database
    .insertInto("mesh_peers",)
    .values(row,)
    .onConflict((oc,) =>
      oc.column("origin",).doUpdateSet({
        state: row.state,
        capabilities: row.capabilities,
        capacity_bytes: row.capacity_bytes,
      },)
    )
    .execute();
  return origin;
}

/**
 * Set a peer's registry state.
 * @param database
 * @param origin
 * @param state
 */
export async function setPeerState(
  database: Kysely<DB>,
  origin: string,
  state: PeerState,
): Promise<void> {
  const result = await database
    .updateTable("mesh_peers",)
    .set({ state, },)
    .where("origin", "=", origin,)
    .executeTakeFirst();
  // Custom sqlite dialect reports numUpdatedRows (not kysely's
  // numUpdatedOrDeletedRows) — see profile.ts / orders.ts precedent.
  if (Number(result?.numUpdatedRows ?? 0,) === 0) {
    throw new Error(`unknown peer: ${origin}`,);
  }
}

/**
 * List registry peers, optionally filtered by state.
 * @param database
 * @param state
 */
export async function listPeers(database: Kysely<DB>, state?: PeerState,) {
  let query = database.selectFrom("mesh_peers",).selectAll();
  if (state !== undefined) { query = query.where("state", "=", state,); }
  return query.orderBy("origin",).execute();
}

/**
 * Record a successful advertisement fetch: refresh capabilities, last_seen,
 * and — when the peer reports a valid figure — inbound capacity.
 * Capacity from the wire is untrusted: non-finite or negative values are
 * ignored and leave the stored figure untouched.
 * @param database
 * @param origin
 * @param advertisement
 */
export async function touchPeer(
  database: Kysely<DB>,
  origin: string,
  advertisement: InstanceAdvertisement,
): Promise<void> {
  const peers = Array.isArray(advertisement.peers,)
    ? advertisement.peers.filter((p,): p is string => typeof p === "string").slice(0, 128,)
    : [];
  const encoded = safeJsonStringify(peers,);
  if (!encoded.ok) { throw new Error("peer capabilities not serializable",); }
  const reported = advertisement.capacityBytes;
  const capacity = typeof reported === "number" && Number.isFinite(reported,) && reported >= 0
    ? reported
    : undefined;
  await database
    .updateTable("mesh_peers",)
    .set({
      capabilities: encoded.value,
      last_seen: sql`(datetime('now'))`,
      ...(capacity !== undefined ? { capacity_bytes: capacity, } : {}),
    },)
    .where("origin", "=", origin,)
    .execute();
}

/**
 * One resync pass: re-fetch every trusted peer's advertisement and refresh
 * the registry. Per-peer misses never abort the pass.
 * @param database
 * @param opts
 */
export async function runResyncPass(
  database: Kysely<DB>,
  opts: {
    trustByOrigin?: Record<string, { caBundle?: string } | undefined>;
    fetchImpl?: PeerFetch;
  } = {},
): Promise<ResyncSummary> {
  const fetchImpl = opts.fetchImpl ?? fetchPeerAdvertisement;
  const trusted = await listPeers(database, "trusted",);
  let alive = 0;
  await Promise.allSettled(trusted.map(async (peer,) => {
    let res;
    try {
      res = await fetchImpl(
        `${peer.origin}/api/instance-state`,
        opts.trustByOrigin?.[peer.origin],
      );
    } catch {
      return;
    }
    if (!res.ok) { return; }
    alive += 1;
    await touchPeer(
      database,
      peer.origin,
      (res.body ?? {}) as InstanceAdvertisement,
    );
  },),);
  return { checked: trusted.length, alive, };
}
