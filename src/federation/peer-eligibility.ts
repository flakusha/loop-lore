// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/peer-eligibility.ts — which peers may run a workload class.
//
// Registry state (trusted / workload_trust / declared vs advertised classes)
// plus the live circuit from ./peer-health. A `suspended` peer is excluded
// here, not merely from content push. Ordering (headroom → latency → origin)
// is the router's job, not this module's.

import type { Kysely, } from "kysely";
import { type PeerWorkloadClass, } from "../db/enums";
import type { DB, } from "../db/schema";
import { peerCircuitOpen, } from "./peer-health";
import { listWorkloadPeers, type WorkloadPeer, } from "./peer-registry";

/**
 * Registry-level eligibility: trusted, workload-trusted, and offering the
 * class in BOTH the declared allow-list and the observed advertisement.
 * A `suspended` or `pending` peer is never eligible.
 * @param peer
 * @param workloadClass
 * @returns {boolean}
 */
export function isWorkloadEligible(peer: WorkloadPeer, workloadClass: PeerWorkloadClass,): boolean {
  return peer.state === "trusted" &&
    peer.workloadTrust &&
    peer.allowedWorkloadClasses.includes(workloadClass,) &&
    peer.advertisedWorkloadClasses.includes(workloadClass,);
}

/**
 * Eligible peers for a class, minus any whose per-class circuit is open.
 * @param database
 * @param workloadClass
 * @returns {Promise<WorkloadPeer[]>}
 */
export async function listEligibleWorkloadPeers(
  database: Kysely<DB>,
  workloadClass: PeerWorkloadClass,
): Promise<WorkloadPeer[]> {
  const peers = await listWorkloadPeers(database, "trusted",);
  return peers.filter((peer,) =>
    isWorkloadEligible(peer, workloadClass,) &&
    !peerCircuitOpen({ origin: peer.origin, workloadClass, },)
  );
}
