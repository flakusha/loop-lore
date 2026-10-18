// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Inbound trust chain for the peer workload endpoint
 * (TASK-federation-peer-workload-wire-endpoints).
 *
 * Layered, and every layer runs BEFORE any work is admitted — a peer trusted to
 * replicate content is NOT thereby trusted to run workloads:
 *
 *   1. the mesh PSK is configured, else the feature is off (503);
 *   2. the claimed origin canonicalizes, else it is unusable (400);
 *   3. the origin is a registry row in state `trusted`;
 *   4. that row carries `workload_trust` (default false);
 *   5. the class is in the row's allow-list AND in this instance's declared
 *      `workloadOffload.classes` — so a peer can never reach a class the
 *      operator did not publish;
 *   6. the per-peer shared token verifies in constant time — for EVERY
 *      workload-trusted peer, whatever its `auth_kind`. Loopback is not a trust
 *      boundary: a peer with no credential would accept work from anything that
 *      can open a socket to the port.
 *
 * Fail-closed throughout. A failure names a routable `PeerWorkErrorCode` and
 * never the value that failed, so nothing here can echo a secret.
 *
 * TRUST BOUNDARY — read before exposing this port off-host.
 *
 * Layers 1-5 are AUTHORIZATION against operator-set policy, and all of them
 * deny by default. Layer 6 is the only AUTHENTICATION, and it applies to every
 * workload-trusted peer. `auth_kind` does NOT select a different check: for a
 * `tls` peer the claimed origin in `x-peer-origin` is still only ASSERTED,
 * because this runtime enforces no client certificate (see
 * `src/federation/peer-fetch.ts`: "mTLS is NOT enforced — runtimes expose no
 * client-certificate handle on fetch"). TLS and the SPKI pin in
 * `src/federation/spki-pin.ts` are an OUTBOUND pre-flight that checks a peer
 * before we call it; they say nothing about who is calling us, so for a remote
 * peer they are an ADDITIONAL layer, never the authentication itself.
 *
 * The invariant this module enforces, therefore: a `trusted`,
 * workload-trusted peer with no valid per-peer credential is refused, so
 * naming such a peer in `x-peer-origin` buys an attacker nothing. The
 * save-time counterpart is `peer-registry-validation.ts`: a workload-trusted
 * peer cannot be saved without a token, whatever its `auth_kind`.
 */
import { type Kysely, } from "kysely";
import { type Config, } from "../config/schema";
import { type PeerWorkloadClass, } from "../db/enums";
import type { DB, } from "../db/schema";
import { getChildLogger, } from "../logger";
import { declaredWorkloadClasses, } from "./peer-capabilities";
import { canonicalOrigin, } from "./peer-fetch";
import { listWorkloadPeers, type WorkloadPeer, } from "./peer-registry";
import { type PeerWorkErrorCode, PeerWorkErrorCode as Codes, } from "./peer-work-wire";
import { verifyPeerWorkloadToken, } from "./peer-workload-token";

/** A rejection: the HTTP status to send and the code the peer routes on. */
export interface PeerWorkAuthFailure {
  status: 400 | 403 | 503;
  errorCode: PeerWorkErrorCode;
  message: string;
}

/** An admitted peer. Its `origin` is the only identity the peer gets back. */
export interface PeerWorkAdmission {
  origin: string;
  peer: WorkloadPeer;
}

/**
 * Decide whether one inbound workload call may be admitted. Never throws and
 * never performs the work: the caller gets an admission or a failure.
 * @param options
 * @param options.database
 * @param options.config
 * @param options.claimedOrigin Value of the peer-origin header.
 * @param options.bearer Presented shared credential, if any.
 * @param options.workloadClass
 * @param options.encryptionKey `config.byoKey.encryptionKey`, for token decrypt.
 * @returns {Promise<PeerWorkAdmission | PeerWorkAuthFailure>}
 */
export async function authorizePeerWork(options: {
  database: Kysely<DB>;
  config: Config;
  claimedOrigin: unknown;
  bearer: string | null;
  workloadClass: PeerWorkloadClass;
  encryptionKey: string;
},): Promise<PeerWorkAdmission | PeerWorkAuthFailure> {
  const { database, config, claimedOrigin, bearer, workloadClass, encryptionKey, } = options;

  if (config.federation.meshPsk === "") {
    return {
      status: 503,
      errorCode: Codes.NotConfigured,
      message: "peer workloads not configured (MESH_PSK unset)",
    };
  }

  const origin = canonicalOrigin(claimedOrigin,);
  if (origin === null) {
    return { status: 400, errorCode: Codes.InvalidOrigin, message: "unusable peer origin", };
  }

  const peers = await listWorkloadPeers(database, "trusted",);
  const peer = peers.find((entry,) => entry.origin === origin);
  if (peer === undefined) {
    return { status: 403, errorCode: Codes.PeerUntrusted, message: "peer is not trusted", };
  }

  if (!peer.workloadTrust) {
    return {
      status: 403,
      errorCode: Codes.WorkloadTrustRequired,
      message: "peer is not granted workload trust",
    };
  }

  if (!peer.allowedWorkloadClasses.includes(workloadClass,)) {
    return {
      status: 403,
      errorCode: Codes.ClassNotAllowed,
      message: "workload class not offered to this peer",
    };
  }

  if (!declaredWorkloadClasses(config,).includes(workloadClass,)) {
    return {
      status: 403,
      errorCode: Codes.ClassNotAllowed,
      message: "workload class is not declared by this instance",
    };
  }

  // Every workload-trusted peer, whatever its auth_kind: the per-peer token is
  // the authentication. `auth_mode` selects no bypass — a `tls` peer's origin
  // in `x-peer-origin` is ASSERTED, so TLS trust cannot stand in for a
  // credential. See the TRUST BOUNDARY note above.
  const credentialed = await verifyPeerWorkloadToken(database, {
    origin,
    presented: bearer,
    encryptionKey,
  },).catch((error: unknown,) => {
    // A decrypt failure (wrong or absent server secret) is a REJECTION, never
    // a bypass: an unverifiable credential proves nothing.
    getChildLogger("federation/peer-work-auth",)?.warn("peer workload credential unreadable", {
      origin,
      reason: error instanceof Error ? error.message : "unknown",
    },);

    return false;
  },);

  if (!credentialed) {
    return {
      status: 403,
      errorCode: Codes.CredentialRejected,
      message: "peer workload credential rejected",
    };
  }

  return { origin, peer, };
}
