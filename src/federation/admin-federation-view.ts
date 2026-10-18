// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/federation/admin-federation-view.ts — the read model the admin panel
 * renders, assembled from the modules that already own each number.
 *
 * Pure assembly, no DB and no network: the caller passes the registry rows, the
 * budget rows and the live counters, and this projects them into the one shape
 * `GET /api/admin/federation/usage` returns. Keeping it pure is what lets the
 * route stay a thin permission-gated wrapper and lets the projection be unit
 * tested without a database.
 *
 * There is deliberately no field here that can hold a shared token. The token
 * is write-only; `hasSharedToken` is the only trace of it that leaves this
 * module, exactly as `WorkloadPeer` already declares.
 */

import type { PeerWorkloadClass, } from "../db/enums";
import { PEER_WORKLOAD_CLASSES, } from "../db/enums-federation";
import type { AdminStorageUsage, } from "./admin-storage-accessor";
import { peerCircuitOpen, peerLoad, } from "./peer-health";
import type { WorkloadPeer, } from "./peer-registry";
import { performanceQuotaUsage, } from "./performance-quota";
import type { PerformanceBudget, PerformanceQuotaUsage, } from "./performance-quota-types";

/** Live load + circuit for one (peer, class) cell. */
export interface AdminPeerClassUsage {
  readonly workloadClass: PeerWorkloadClass;
  /** In-flight requests this instance currently holds against the peer. */
  readonly inFlight: number;
  /** Configured concurrency ceiling, or null when unlimited. */
  readonly maxConcurrency: number | null;
  /** Free slots, or null when unlimited. The router's route-away signal. */
  readonly headroom: number | null;
  /** Observed latency EWMA in ms, or null before the first sample. */
  readonly ewmaLatencyMs: number | null;
  /** True while the peer's per-class circuit refuses a request. */
  readonly circuitOpen: boolean;
  /** The operator-set budget, or null when the cell is unlimited. */
  readonly budget: PerformanceBudget | null;
  /** Receiver-side admission counters, when federation quotas are enabled. */
  readonly quota: PerformanceQuotaUsage | null;
}

/** Everything the panel shows for one peer. Carries no secret. */
export interface AdminPeerView {
  readonly origin: string;
  readonly displayName: string | null;
  readonly state: string;
  /** Derived from the origin host; never persisted. */
  readonly linkKind: string;
  readonly instanceKind: string;
  readonly authMode: string;
  readonly workloadTrust: boolean;
  readonly stickyEnabled: boolean;
  readonly allowedWorkloadClasses: readonly string[];
  readonly advertisedWorkloadClasses: readonly string[];
  /** Whether a workload token is stored — never the token itself. */
  readonly hasSharedToken: boolean;
  readonly capacityBytes: number | null;
  /** One entry per class in the closed enum, ordered by it. */
  readonly classes: readonly AdminPeerClassUsage[];
}

/**
 * Look up the operator budget for one (peer, class) cell.
 *
 * @param budgets All operator-set budgets.
 * @param origin
 * @param workloadClass
 * @returns {PerformanceBudget | null}
 */
function budgetFor(
  budgets: readonly PerformanceBudget[],
  origin: string,
  workloadClass: PeerWorkloadClass,
): PerformanceBudget | null {
  for (const budget of budgets) {
    if (budget.origin === origin && budget.workloadClass === workloadClass) { return budget; }
  }

  return null;
}

/**
 * Project one registry peer onto the admin read model.
 *
 * Every class in the closed enum gets a cell, including ones the peer is not
 * allowed to serve: an empty row in the panel is how the operator SEES that a
 * class is local-only, so omitting it would hide the default.
 *
 * @param peer Registry row.
 * @param budgets Operator-set budgets, for the per-cell budget column.
 * @param usage Receiver-side usage by cell key, when quotas are enabled.
 * @param usageKey Builds the cell key a usage map is indexed by.
 * @returns {AdminPeerView}
 */
export function projectPeerForAdmin(
  peer: WorkloadPeer,
  budgets: readonly PerformanceBudget[],
): AdminPeerView {
  const classes = PEER_WORKLOAD_CLASSES.map((workloadClass,) => {
    const load = peerLoad({ origin: peer.origin, workloadClass, },);
    return {
      workloadClass,
      inFlight: load.inFlight,
      maxConcurrency: load.maxConcurrency,
      headroom: load.headroom,
      ewmaLatencyMs: load.ewmaLatencyMs,
      circuitOpen: peerCircuitOpen({ origin: peer.origin, workloadClass, },),
      budget: budgetFor(budgets, peer.origin, workloadClass,),
      // Reads the receiver-side admission counters the guard itself writes, so
      // the panel shows budget-vs-usage from the enforcement path rather than a
      // second tally that could disagree with it.
      quota: performanceQuotaUsage({ origin: peer.origin, workloadClass, },),
    };
  },);

  return {
    origin: peer.origin,
    displayName: peer.displayName,
    state: peer.state,
    linkKind: peer.linkKind,
    instanceKind: peer.instanceKind,
    authMode: peer.authMode,
    workloadTrust: peer.workloadTrust,
    stickyEnabled: peer.stickyEnabled,
    allowedWorkloadClasses: peer.allowedWorkloadClasses,
    advertisedWorkloadClasses: peer.advertisedWorkloadClasses,
    hasSharedToken: peer.hasSharedToken,
    capacityBytes: peer.capacityBytes,
    classes,
  };
}

/** The whole dashboard payload: every peer plus the instance storage figure. */
export interface AdminFederationView {
  readonly peers: readonly AdminPeerView[];
  /** Instance storage usage, or null when the storage-quota branch is absent. */
  readonly storage: AdminStorageUsage | null;
}

/**
 * Project the full dashboard from registry rows and budget rows.
 *
 * Peers are projected in registry order (already origin-sorted by
 * `listWorkloadPeers`), so the panel renders a stable table across refreshes.
 *
 * @param options
 * @param options.peers Registry rows from `listWorkloadPeers`.
 * @param options.budgets Budget rows from `listPerformanceBudgets`.
 * @param options.storage Result of the storage accessor, nullable.
 * @returns {AdminFederationView}
 */
export function buildAdminFederationView(options: {
  peers: readonly WorkloadPeer[];
  budgets: readonly PerformanceBudget[];
  storage?: AdminStorageUsage | null;
},): AdminFederationView {
  return {
    peers: options.peers.map((peer,) => projectPeerForAdmin(peer, options.budgets,)),
    storage: options.storage ?? null,
  };
}
