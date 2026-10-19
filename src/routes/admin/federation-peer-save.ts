// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Validate + save one federation peer, plus the per-peer probe trust lookup.
 *
 * Split out of `./federation-peers` for the 250-line `size - strict` budget: the
 * save path owns the whole write contract, while the route module owns only the
 * HTTP surface.
 *
 * Validation is delegated wholesale to `validatePeerWorkloadSave` so the route
 * and the registry store can never disagree about what a valid peer is: a
 * non-http(s) origin, a loopback origin without a token, a token on a remote
 * origin, a class outside the enum and a duplicate origin are ALL rejected by
 * the shared validator, not re-implemented here.
 *
 * The shared token is WRITE-ONLY. It is accepted on save, handed straight to
 * `savePeerWorkload` for encryption, and never placed in a response, an audit
 * `meta` blob, or a log line. `WorkloadPeer` exposes only `hasSharedToken`.
 *
 * A save runs a live probe: a peer that cannot answer `/api/instance-state` is
 * stored `pending`, never `trusted`, and the operator is told why.
 */

import { PEER_INSTANCE_KINDS, PEER_WORKLOAD_CLASSES, } from "../../db/enums";
import { setPeerState, } from "../../federation/coordinator";
import { canonicalOrigin, } from "../../federation/peer-fetch";
import { type PeerProbeFetch, probePeerHealth, } from "../../federation/peer-health-probe";
import { PeerWorkloadValidationError, savePeerWorkload, } from "../../federation/peer-registry";
import { getChildLogger, } from "../../logger";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../http-utils";
import {
  auditFederationChange,
  badOriginResponse,
  isInstanceKind,
  isWorkloadClass,
  notInEnumResponse,
} from "./federation-shared";
import type { AdminFederationRouteOpts, } from "./federation-types";

/** Per-peer CA/SPKI trust overrides for the probe, from `config.federation.peers`. */
function configTrustFor(opts: AdminFederationRouteOpts, origin: string,) {
  return opts.config.federation.peers.find((peer,) => canonicalOrigin(peer.origin,) === origin);
}

/** Validate + save one peer, mapping every rejection onto a 400. */
export async function savePeer(
  opts: AdminFederationRouteOpts,
  actorId: string,
  body: {
    origin: string;
    displayName?: string | null;
    instanceKind?: string;
    authMode?: string;
    workloadTrust?: boolean;
    allowedWorkloadClasses?: string[];
    stickyEnabled?: boolean;
    sharedToken?: string | null;
  },
): Promise<Response> {
  const origin = canonicalOrigin(body.origin,);
  if (origin === null) { return badOriginResponse(); }

  // A shared token is encrypted at rest with the BYOK key. With no key
  // configured there is nothing trustworthy to encrypt it under, so the save is
  // refused outright rather than storing a token under an empty secret.
  if (body.sharedToken != null && body.sharedToken.trim() !== "" && opts.encryptionKey === "") {
    return jsonError({
      message: "byoKey.encryptionKey must be configured before a peer shared token can be stored",
      status: HttpStatus.BadRequest,
      code: ErrorCode.BadRequest,
      data: { reason: "missing_encryption_key", },
    },);
  }

  const kind = body.instanceKind ?? "general";
  if (!isInstanceKind(kind,)) { return notInEnumResponse("instanceKind", kind, PEER_INSTANCE_KINDS,); }

  for (const entry of body.allowedWorkloadClasses ?? []) {
    if (!isWorkloadClass(entry,)) { return notInEnumResponse("allowedWorkloadClasses", entry, PEER_WORKLOAD_CLASSES,); }
  }

  const trust = configTrustFor(opts, origin,);
  const probe = await probePeerHealth({
    origin,
    ...(trust?.trust === undefined ? {} : { trust: trust.trust, }),
    ...(opts.probeFetch === undefined ? {} : { fetchImpl: opts.probeFetch as PeerProbeFetch, }),
  },);

  let peer;
  try {
    peer = await savePeerWorkload(opts.database, {
      origin,
      displayName: body.displayName ?? null,
      instanceKind: kind,
      workloadTrust: body.workloadTrust === true,
      allowedWorkloadClasses: (body.allowedWorkloadClasses ?? []).filter(isWorkloadClass,),
      stickyEnabled: body.stickyEnabled === true,
      sharedToken: body.sharedToken ?? null,
      encryptionKey: opts.encryptionKey,
    },);
  } catch (error) {
    if (error instanceof PeerWorkloadValidationError) {
      return jsonError({
        message: error.message,
        status: HttpStatus.BadRequest,
        code: ErrorCode.BadRequest,
        data: { reason: error.reason, },
      },);
    }

    throw error;
  }

  // A peer is trusted ONLY once it has answered its own advertisement. An
  // unreachable peer stays pending so no workload can be routed to it.
  const state = probe.outcome === "reachable" ? "trusted" : "pending";
  if (state === "trusted") { await setPeerState(opts.database, peer.origin, "trusted",); }

  await auditFederationChange({
    database: opts.database,
    actorId,
    eventType: "federation.peer_saved",
    action: "peer_save",
    entityType: "mesh_peer",
    entityId: peer.origin,
    message: `Peer saved: ${peer.origin} (probe ${probe.outcome})`,
    meta: {
      origin: peer.origin,
      probeOutcome: probe.outcome,
      linkKind: peer.linkKind,
      workloadTrust: peer.workloadTrust,
      allowedWorkloadClasses: peer.allowedWorkloadClasses,
      hasSharedToken: peer.hasSharedToken,
    },
  },);

  getChildLogger("admin-federation",)?.info("peer saved", { origin: peer.origin, probe: probe.outcome, },);
  return jsonResponse({ peer: { ...peer, state, }, probe, },);
}
