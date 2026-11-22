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
import { PEER_WORKLOAD_CLASSES, type PeerWorkloadClass, } from "../db/enums";
import type { DB, } from "../db/schema";
import { safeJsonParse, safeJsonStringify, } from "../utils";
import { parseAdvertisedClasses, } from "./peer-capabilities";
import {
  canonicalOrigin,
  fetchPeerAdvertisement,
  type InstanceAdvertisement,
  type PeerFetch,
} from "./peer-fetch";
import { configurePeerConcurrency, recordPeerHealthMiss, } from "./peer-health";
import { listPerformanceBudgets, } from "./performance-quota-store";

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
 * Install a peer's persisted concurrency ceilings. A budget without a
 * `maxConcurrency` resets its class to unlimited, so removing a ceiling does
 * not leave a stale limit in the routing snapshot.
 */
async function applyPeerConcurrency(database: Kysely<DB>, origin: string,): Promise<void> {
  const budgets = await listPerformanceBudgets(database,);
  for (const budget of budgets) {
    if (budget.origin !== origin) { continue; }
    configurePeerConcurrency({
      origin,
      workloadClass: budget.workloadClass,
      maxConcurrency: budget.maxConcurrency,
    },);
  }
}

/**
 * Classes a trusted peer was expected to serve. A peer with no advertised
 * classes still has every class circuit-failed when it is unreachable.
 */
function expectedClasses(capabilities: string,): readonly PeerWorkloadClass[] {
  const parsed = safeJsonParse<unknown>(capabilities,);
  const advertised = parseAdvertisedClasses(parsed.ok ? parsed.value : [],);
  return advertised.length > 0 ? advertised : PEER_WORKLOAD_CLASSES;
}

/**
 * Insert a peer or refresh its row when already known.
 * @param database
 * @param peer
 * @param peer.origin
 * @param peer.state
 * @param peer.capabilities
 * @param peer.capacityBytes
 * @returns Canonical origin stored.
 * @throws {Error}
 * @throws {Error}
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

  await applyPeerConcurrency(database, origin,);
  return origin;
}

/**
 * Set a peer's registry state.
 * @param database
 * @param origin
 * @param state
 * @throws {Error}
 * @returns {Promise<void>}
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
 * @returns {Promise<{ created_at: string; origin: string; state: string; capabilities: string; last_seen: string | null; capacity_bytes: number | null; }[]>}
 */
export async function listPeers(database: Kysely<DB>, state?: PeerState,) {
  let query = database.selectFrom("mesh_peers",).selectAll();
  if (state !== undefined) { query = query.where("state", "=", state,); }
  return query.orderBy("origin",).execute();
}

/**
 * Record a successful advertisement fetch: refresh capabilities, last_seen,
 * and — when the peer reports a valid figure — inbound capacity.
 *
 * `capabilities` holds the peer's ADVERTISED workload classes, normalized
 * through `parseAdvertisedClasses`: unknown strings are dropped, and a class
 * the peer stops advertising is removed rather than retained.
 *
 * Capacity from the wire is untrusted: non-finite or negative values are
 * ignored and leave the stored figure untouched.
 * @param database
 * @param origin
 * @param advertisement
 * @throws {Error}
 * @returns {Promise<void>}
 */
export async function touchPeer(
  database: Kysely<DB>,
  origin: string,
  advertisement: InstanceAdvertisement,
): Promise<void> {
  const advertised = parseAdvertisedClasses(advertisement.capabilities,);

  const encoded = safeJsonStringify(advertised,);
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

  await applyPeerConcurrency(database, origin,);
}

/**
 * One resync pass: re-fetch every trusted peer's advertisement and refresh
 * the registry. Per-peer misses never abort the pass.
 * @param database
 * @param opts
 * @param opts.trustByOrigin
 * @param opts.fetchImpl
 * @returns {Promise<ResyncSummary>}
 */
export async function runResyncPass(
  database: Kysely<DB>,
  opts: {
    trustByOrigin?: Record<string, { caBundle?: string; spkiPins?: string[] } | undefined>;
    fetchImpl?: PeerFetch;
    pinVerifier?: (origin: string, pins: readonly string[],) => Promise<boolean>;
  } = {},
): Promise<ResyncSummary> {
  const fetchImpl = opts.fetchImpl ?? fetchPeerAdvertisement;
  // Canonicalize trust config keys (mirrors GossipService) so non-canonical
  // origins still resolve their caBundle/spkiPins.
  const trustByOrigin = new Map<string, { caBundle?: string; spkiPins?: string[] } | undefined>();
  for (const [raw, trust,] of Object.entries(opts.trustByOrigin ?? {},)) {
    const canonical = canonicalOrigin(raw,);
    if (canonical !== null) { trustByOrigin.set(canonical, trust,); }
  }

  const trusted = await listPeers(database, "trusted",);
  let alive = 0;
  await Promise.allSettled(trusted.map(async (peer,) => {
    const originKey = canonicalOrigin(peer.origin,) ?? peer.origin;
    const trust = trustByOrigin.get(originKey,) ?? opts.trustByOrigin?.[peer.origin];
    const miss = (): void => recordPeerHealthMiss(peer.origin, expectedClasses(peer.capabilities,),);
    // SPKI pin gate: refuse to fetch peers whose pin fails verification.
    if (trust?.spkiPins && trust.spkiPins.length > 0 && opts.pinVerifier !== undefined) {
      const pinned = await opts.pinVerifier(originKey, trust.spkiPins,);
      if (!pinned) {
        miss();
        return;
      }
    }

    let res;
    try {
      res = await fetchImpl(
        `${peer.origin}/api/instance-state`,
        trust,
      );
    } catch {
      miss();
      return;
    }

    if (!res.ok) {
      miss();
      return;
    }

    alive += 1;
    await touchPeer(
      database,
      peer.origin,
      (res.body ?? {}) as InstanceAdvertisement,
    );
  },),);

  return { checked: trusted.length, alive, };
}
