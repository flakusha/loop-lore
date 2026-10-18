// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/federation/peer-health-probe.ts — the live reachability check a peer save
 * runs, so an unreachable peer is stored `pending` and never `trusted`.
 *
 * Reuses `fetchPeerAdvertisement` (the SAME seam gossip and `runResyncPass`
 * use) rather than opening a second fetch path, so the probe and the resync
 * pass cannot disagree about what a peer answers. The verdict carries a reason
 * back to the operator and never carries the peer's credential.
 */

import type { FederationPeerTrustConfig, } from "../config/schema";
import { fetchPeerAdvertisement, } from "./peer-fetch";

/** Why a probe reached the verdict it did. Branch on this, never on the reason. */
export type PeerProbeOutcome = "reachable" | "unreachable" | "not-ok" | "malformed";

/** Machine-readable verdict plus the operator-facing reason. Carries no secret. */
export interface PeerProbeVerdict {
  readonly outcome: PeerProbeOutcome;
  /** Human-readable reason. Empty on `reachable`. */
  readonly reason: string;
}

/** Injectable fetch seam so the probe is testable without a network. */
export type PeerProbeFetch = (
  url: string,
  trust: FederationPeerTrustConfig | undefined,
) => Promise<{ ok: boolean; status: number; body: unknown }>;

/** A peer that answered with a non-object body has not advertised anything usable. */
function isAdvertisement(body: unknown,): boolean {
  return typeof body === "object" && body !== null && !Array.isArray(body,);
}

/**
 * Probe a peer's `/api/instance-state` and classify the answer.
 *
 * NEVER throws: an operator saving a peer must always get a verdict back, and
 * an unreachable host is an expected outcome, not an error path.
 *
 * @param options
 * @param options.origin Canonical peer origin.
 * @param options.trust Per-peer CA/SPKI overrides from `config.federation.peers`.
 * @param options.fetchImpl Injectable transport; defaults to the real one.
 * @returns {Promise<PeerProbeVerdict>}
 */
export async function probePeerHealth(options: {
  origin: string;
  trust?: FederationPeerTrustConfig | undefined;
  fetchImpl?: PeerProbeFetch;
},): Promise<PeerProbeVerdict> {
  const doFetch = options.fetchImpl ?? fetchPeerAdvertisement;

  try {
    const res = await doFetch(`${options.origin}/api/instance-state`, options.trust,);
    if (!res.ok) {
      return { outcome: "not-ok", reason: `instance-state returned HTTP ${res.status}`, };
    }

    if (!isAdvertisement(res.body,)) {
      return { outcome: "malformed", reason: "instance-state body is not an advertisement object", };
    }

    return { outcome: "reachable", reason: "", };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown transport error";
    return { outcome: "unreachable", reason: `instance-state unreachable: ${detail}`, };
  }
}
