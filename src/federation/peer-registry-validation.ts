// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/peer-registry-validation.ts — save-time validation for the
// workload columns, and the pure origin → link-kind derivation.
//
// Pure and DB-free so it can be unit-tested on its own; `peer-registry.ts`
// owns the persistence. Never logs and never echoes the shared token: a
// rejection message names the FIELD, not the value.

import {
  type PeerAuthMode,
  PeerAuthMode as AuthMode,
  type PeerInstanceKind,
  PeerInstanceKind as InstanceKind,
  type PeerLinkKind,
  PeerLinkKind as LinkKind,
  type PeerWorkloadClass,
} from "../db/enums";
import { isPeerWorkloadClass, } from "./peer-capabilities";
import { canonicalOrigin, } from "./peer-fetch";

/** Machine-readable rejection reason — branch on this, never on the message. */
export type PeerWorkloadRejection =
  | "invalid_origin"
  | "unknown_workload_class"
  | "auth_mode_mismatch"
  | "loopback_without_token"
  | "workload_trust_without_token"
  | "duplicate_origin";

/** Typed rejection from the peer workload save path. Carries no secret. */
export class PeerWorkloadValidationError extends Error {
  override readonly name = "PeerWorkloadValidationError";

  /**
   * @param reason Machine-readable rejection reason.
   * @param message Human-readable detail (names fields, never values).
   */
  constructor(public readonly reason: PeerWorkloadRejection, message: string,) {
    super(message,);
  }
}

/**
 * Reject any entry outside the closed class enum and return the deduped set.
 * Shared by the save path and `setAllowedWorkloadClasses` so the two can
 * never drift on what "a valid class" means.
 * @param classes
 * @returns {PeerWorkloadClass[]}
 * @throws {PeerWorkloadValidationError}
 */
export function assertWorkloadClasses(classes: readonly string[],): PeerWorkloadClass[] {
  const kept: PeerWorkloadClass[] = [];
  for (const entry of classes) {
    if (!isPeerWorkloadClass(entry,)) {
      throw new PeerWorkloadValidationError(
        "unknown_workload_class",
        `allowed_workload_classes entry is not a PeerWorkloadClass: ${entry}`,
      );
    }

    if (!kept.includes(entry,)) { kept.push(entry,); }
  }

  return kept;
}

/** Raw save input, as an operator or admin route would supply it. */
export interface PeerWorkloadSave {
  /** Peer origin; canonicalized before anything else is looked at. */
  origin: string;
  /** Operator-facing label; the UI falls back to the origin. */
  displayName?: string | null;
  /** What this peer is for. Defaults to `general`. */
  instanceKind?: PeerInstanceKind;
  /** Defaults from the derived link kind: loopback → `host-local`, else `tls`. */
  authMode?: PeerAuthMode;
  /** Default-false grant to execute workloads. */
  workloadTrust?: boolean;
  /** Subset of {@link PeerWorkloadClass} this peer will accept. */
  allowedWorkloadClasses?: readonly PeerWorkloadClass[];
  /** Whether chat sessions may pin to this peer. */
  stickyEnabled?: boolean;
  /** Shared workload token; required for every workload-trusted peer. */
  sharedToken?: string | null;
}

/** Validated, defaulted save input. `sharedToken` is plaintext-once. */
export interface ValidatedPeerWorkload {
  /** Canonical origin (primary key). */
  origin: string;
  /** Derived from the origin host; never persisted. */
  linkKind: PeerLinkKind;
  displayName: string | null;
  instanceKind: PeerInstanceKind;
  authMode: PeerAuthMode;
  workloadTrust: number;
  allowedWorkloadClasses: PeerWorkloadClass[];
  stickyEnabled: number;
  /** Trimmed plaintext token, or null when the peer has none. */
  sharedToken: string | null;
}

/**
 * Derive a peer's link kind from its origin host. `127.0.0.1`, `::1`,
 * `localhost` and `*.localhost` are loopback; anything else is remote.
 * Pure and total — a non-http(s) or unparseable origin yields null instead of
 * throwing, so a malformed row can never crash a caller.
 * @param origin
 * @returns {PeerLinkKind | null}
 */
export function derivedLinkKind(origin: unknown,): PeerLinkKind | null {
  if (typeof origin !== "string") { return null; }
  let host: string;
  try {
    const url = new URL(origin,);
    if (url.protocol !== "http:" && url.protocol !== "https:") { return null; }
    host = url.hostname.toLowerCase();
  } catch {
    return null;
  }

  if (host === "127.0.0.1" || host === "[::1]" || host === "localhost") {
    return LinkKind.Loopback;
  }

  return host.endsWith(".localhost",) ? LinkKind.Loopback : LinkKind.Remote;
}

/**
 * Validate and default a peer workload save.
 *
 * Rejects (in order): a non-http(s) origin, an `allowed_workload_classes`
 * entry outside the closed enum, an `auth_mode` that contradicts the derived
 * link kind, a loopback origin with no token, and a `workloadTrust` grant with
 * no token on any link kind. The last rule is the save-time half of the
 * invariant `authorizePeerWork` enforces at request time: a workload-trusted
 * peer always authenticates with its per-peer shared token, whatever its
 * `auth_kind` — TLS/SPKI trust is an additional outbound layer, never the
 * authentication.
 * @param input
 * @returns {ValidatedPeerWorkload}
 * @throws {PeerWorkloadValidationError}
 */
export function validatePeerWorkloadSave(input: PeerWorkloadSave,): ValidatedPeerWorkload {
  const origin = canonicalOrigin(input.origin,);
  if (origin === null) {
    throw new PeerWorkloadValidationError(
      "invalid_origin",
      `peer origin must be an http(s) URL: ${input.origin}`,
    );
  }

  const classes = assertWorkloadClasses(input.allowedWorkloadClasses ?? [],);

  const linkKind = derivedLinkKind(origin,);
  if (linkKind === null) {
    throw new PeerWorkloadValidationError("invalid_origin", `peer origin is unusable: ${origin}`,);
  }

  const authMode = input.authMode ??
    (linkKind === LinkKind.Loopback ? AuthMode.HostLocal : AuthMode.Tls);

  const expected = linkKind === LinkKind.Loopback ? AuthMode.HostLocal : AuthMode.Tls;
  if (authMode !== expected) {
    throw new PeerWorkloadValidationError(
      "auth_mode_mismatch",
      `auth_mode "${authMode}" is not valid for a ${linkKind} origin (expected "${expected}")`,
    );
  }

  const sharedToken = input.sharedToken?.trim() || null;
  if (linkKind === LinkKind.Loopback && sharedToken === null) {
    throw new PeerWorkloadValidationError(
      "loopback_without_token",
      "a loopback peer requires a sharedToken: an open loopback port is not a trust boundary",
    );
  }

  if (input.workloadTrust === true && sharedToken === null) {
    throw new PeerWorkloadValidationError(
      "workload_trust_without_token",
      "a workload-trusted peer requires a sharedToken whatever its linkKind: TLS trust is an outbound layer, not the authentication",
    );
  }

  return {
    origin,
    linkKind,
    displayName: input.displayName ?? null,
    instanceKind: input.instanceKind ?? InstanceKind.General,
    authMode,
    workloadTrust: input.workloadTrust === true ? 1 : 0,
    allowedWorkloadClasses: [...classes,],
    stickyEnabled: input.stickyEnabled === true ? 1 : 0,
    sharedToken,
  };
}
