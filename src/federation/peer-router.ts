// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Peer workload routing policy (TASK-federation-workload-routing-policy).
 *
 * `resolvePeerRoute()` is the DECISION, not the dispatch: it answers "local or
 * a peer?" and nothing else. It is pure — no clock, no network, no
 * randomness — so two calls with identical inputs return an identical result,
 * the property that makes it testable the way `ModelRouter.route()` is
 * (`src/generation/routing/router.ts:58`).
 *
 * Precedence, each stage narrowing the previous one:
 *   1. class known + federation enabled, else LOCAL.
 *   2. eligibility — `isWorkloadEligible` (trusted, workload_trust, class in
 *      BOTH the allowed set and the advertisement) and the peer's per-class
 *      circuit not open.
 *   3. the operator's assignment matrix narrows candidates. A class with NO
 *      row is LOCAL-ONLY. This stage deliberately sits ahead of stickiness:
 *      emptying a matrix row is the per-class federation kill switch, and a
 *      surviving sticky pin would defeat it.
 *   4. stickiness — an existing `(affinityKey, class)` assignment wins while
 *      its peer survives stages 1-3. ONLY `chat` is sticky; every other class
 *      is stateless per request.
 *   5. ranking — headroom, then latency EWMA, then a stable origin tiebreak.
 *      Local is not in this list: it is the fallback when it empties.
 *
 * A peer is NEVER an `LLMProvider`. Nothing here touches the provider registry
 * or `buildFailoverList` — the dispatch seam (./peer-dispatch) owns the single
 * local/remote failover decision, this module only names a target.
 */

import { createHash, } from "node:crypto";
import { type PeerWorkloadClass, } from "../db/enums";
import { getChildLogger, } from "../logger";
import { isPeerWorkloadClass, } from "./peer-capabilities";
import { isWorkloadEligible, } from "./peer-eligibility";
import { peerCircuitOpen, peerLoad, } from "./peer-health";
import type { WorkloadPeer, } from "./peer-registry";

/** The only sticky workload class. Every other class is stateless per request. */
export const STICKY_WORKLOAD_CLASS: PeerWorkloadClass = "chat";

/** Why the router landed where it did. Logged, never shown as a message. */
export const PeerRouteReason = {
  FederationDisabled: "federation-disabled",
  UnknownWorkloadClass: "unknown-workload-class",
  NoMatrixRow: "no-matrix-row",
  NoEligiblePeer: "no-eligible-peer",
  StickyAssignment: "sticky-assignment",
  Ranked: "ranked",
} as const;
/** Why the router landed where it did. */
export type PeerRouteReason = (typeof PeerRouteReason)[keyof typeof PeerRouteReason];

/** Why one candidate was dropped — the epic's observability vocabulary. */
export type PeerExclusionReason = "untrusted" | "capability-missing" | "circuit-open" | "not-in-matrix";

/** One excluded candidate, as emitted by {@link resolvePeerRoute}. */
export interface PeerExclusion {
  origin: string;
  reason: PeerExclusionReason;
}

/** The operator's per-class preference matrix. A MISSING class is local-only. */
export interface PeerAssignmentMatrix {
  /** class -> ordered peer origins the operator permits for that class. */
  preferences: Readonly<Partial<Record<PeerWorkloadClass, readonly string[]>>>;
}

/** The stored pin for one `(affinityKey, class)`. See ./peer-work-assignments. */
export interface PeerWorkloadAssignment {
  affinityKey: string;
  workloadClass: PeerWorkloadClass;
  /** The peer currently pinned. */
  peerOrigin: string;
}

/** Route to this instance's own provider chain — the unchanged default path. */
export interface PeerLocalRoute {
  target: "local";
  reason: PeerRouteReason;
}

/** Route to a peer. `assignmentKey` is opaque on the wire, never the chat id. */
export interface PeerRemoteRoute {
  target: "peer";
  peer: WorkloadPeer;
  /** Opaque handle; the chat -> peer mapping never leaves this instance. */
  assignmentKey: string;
  reason: PeerRouteReason;
}

/** What `resolvePeerRoute` returns. Never `undefined`. */
export type PeerRouteDecision = PeerLocalRoute | PeerRemoteRoute;

/** Everything the pure router is allowed to see. */
export interface PeerRouteInput {
  /** `config.federation.enabled`. False forces local for every class. */
  federationEnabled: boolean;
  /** Narrowed against the closed enum; an unknown value resolves to local. */
  workloadClass: string;
  /** Opaque local session handle. Only meaningful for `chat`. */
  affinityKey?: string;
  /** Registry peers. Eligibility is applied here, not assumed of the caller. */
  peers: readonly WorkloadPeer[];
  /** Operator-set per-class preference list. Empty/missing = local-only. */
  matrix: PeerAssignmentMatrix;
  /** The stored pin, when one exists. Read before dispatch. */
  assignment?: PeerWorkloadAssignment | null;
}

/** Local route with an explicit reason. */
function local(reason: PeerRouteReason,): PeerLocalRoute {
  return { target: "local", reason, };
}

/**
 * Deterministic, opaque wire handle for one assignment. Stateless classes have
 * no affinity key, so the peer origin seeds the digest — the key stays stable
 * for a repeated stateless request and reveals nothing about who asked.
 * @param options
 * @param options.affinityKey
 * @param options.workloadClass
 * @param options.peerOrigin
 * @returns 32 hex characters of sha256.
 */
export function peerAssignmentKey(
  options: { affinityKey?: string; workloadClass: PeerWorkloadClass; peerOrigin: string },
): string {
  return createHash("sha256",)
    .update(
      `${options.affinityKey ?? options.peerOrigin}\u0000${options.workloadClass}\u0000${options.peerOrigin}`,
      "utf8",
    )
    .digest("hex",)
    .slice(0, 32,);
}

/**
 * Stages 2-3: eligible peers, in matrix preference order. Drops every
 * ineligible candidate with the reason it was dropped.
 * @param input
 * @param workloadClass
 * @returns
 */
function narrowCandidates(
  input: PeerRouteInput,
  workloadClass: PeerWorkloadClass,
): { candidates: WorkloadPeer[]; excluded: PeerExclusion[] } {
  const row = input.matrix.preferences[workloadClass];
  const permitted = new Set(row ?? [],);
  const candidates: WorkloadPeer[] = [];
  const excluded: PeerExclusion[] = [];

  for (const peer of input.peers) {
    if (!permitted.has(peer.origin,)) {
      excluded.push({ origin: peer.origin, reason: "not-in-matrix", },);
      continue;
    }

    if (!isWorkloadEligible(peer, workloadClass,)) {
      excluded.push({ origin: peer.origin, reason: peer.state !== "trusted" ? "untrusted" : "capability-missing", },);
      continue;
    }

    if (peerCircuitOpen({ origin: peer.origin, workloadClass, },)) {
      excluded.push({ origin: peer.origin, reason: "circuit-open", },);
      continue;
    }

    candidates.push(peer,);
  }

  return { candidates, excluded, };
}

/**
 * Stage 5 order: more headroom first, then lower latency EWMA, then the
 * lexicographically smaller origin. A null headroom is unlimited (best); a
 * null EWMA is "never sampled", which sorts last among equals rather than
 * counting as fast — an unmeasured peer never outranks a measured one.
 * @param workloadClass
 * @returns Comparator over origins.
 */
export function peerRankComparator(
  workloadClass: PeerWorkloadClass,
): (a: string, b: string,) => number {
  const headroom = (origin: string,): number => {
    const value = peerLoad({ origin, workloadClass, },).headroom;
    return value === null ? Number.POSITIVE_INFINITY : value;
  };

  const latency = (origin: string,): number => {
    const value = peerLoad({ origin, workloadClass, },).ewmaLatencyMs;
    return value === null ? Number.POSITIVE_INFINITY : value;
  };

  return (a: string, b: string,): number =>
    headroom(b,) - headroom(a,) ||
    latency(a,) - latency(b,) ||
    (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * Decide local vs peer for one workload. Pure: identical inputs, identical
 * output, every time. Never throws — an unknown class is a local route.
 * @param input
 * @returns The decision, plus why each rejected candidate was dropped.
 */
export function resolvePeerRoute(
  input: PeerRouteInput,
): PeerRouteDecision & { excluded: PeerExclusion[] } {
  const log = getChildLogger("federation/peer-router",);

  if (!isPeerWorkloadClass(input.workloadClass,)) {
    log?.warn("unknown workload class routed local", { workloadClass: input.workloadClass, },);
    return { ...local(PeerRouteReason.UnknownWorkloadClass,), excluded: [], };
  }

  const workloadClass = input.workloadClass;
  if (!input.federationEnabled) {
    return { ...local(PeerRouteReason.FederationDisabled,), excluded: [], };
  }

  const { candidates, excluded, } = narrowCandidates(input, workloadClass,);
  if (candidates.length === 0) {
    const row = input.matrix.preferences[workloadClass];
    const reason = row === undefined || row.length === 0
      ? PeerRouteReason.NoMatrixRow
      : PeerRouteReason.NoEligiblePeer;

    log?.info("peer workload routed local", { workloadClass, reason, excluded, },);
    return { ...local(reason,), excluded, };
  }

  const assignment = input.assignment ?? null;
  const isStickyClass = workloadClass === STICKY_WORKLOAD_CLASS;
  const pinned = isStickyClass && assignment !== null && assignment.workloadClass === workloadClass
    ? candidates.find((peer,) => peer.origin === assignment.peerOrigin)
    : undefined;

  const byRank = peerRankComparator(workloadClass,);
  const chosen = pinned ?? candidates.toSorted((a, b,) => byRank(a.origin, b.origin,))[0]!;
  const reason = pinned === undefined ? PeerRouteReason.Ranked : PeerRouteReason.StickyAssignment;

  log?.info("peer workload routed", { workloadClass, target: chosen.origin, reason, excluded, },);
  return {
    target: "peer",
    peer: chosen,
    assignmentKey: peerAssignmentKey({
      ...(assignment?.affinityKey === undefined ? {} : { affinityKey: assignment.affinityKey, }),
      workloadClass,
      peerOrigin: chosen.origin,
    },),
    reason,
    excluded,
  };
}
