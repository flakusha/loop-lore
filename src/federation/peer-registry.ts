// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/peer-registry.ts — typed accessors over the EXISTING
// `mesh_peers` registry (`./coordinator`). No second registry, no parallel
// discovery path: every read goes through `listPeers`, every write is a
// single UPDATE keyed on origin (no read-modify-write of the row).
//
// The shared workload token is encrypted at rest with `encryptValue` under the
// BYOK store's server secret and is NEVER returned, logged, or included in a
// view — `WorkloadPeer` exposes only `hasSharedToken`.

import type { Kysely, } from "kysely";
import { encryptValue, } from "../crypto/byok";
import {
  type PeerAuthMode,
  type PeerInstanceKind,
  type PeerLinkKind,
  type PeerWorkloadClass,
} from "../db/enums";
import type { DB, } from "../db/schema";
import { getChildLogger, } from "../logger";
import { safeJsonParse, safeJsonStringify, } from "../utils";
import { listPeers, type PeerState, } from "./coordinator";
import { parseAdvertisedClasses, } from "./peer-capabilities";
import {
  assertWorkloadClasses,
  derivedLinkKind,
  type PeerWorkloadSave,
  PeerWorkloadValidationError,
  validatePeerWorkloadSave,
} from "./peer-registry-validation";

export { derivedLinkKind, PeerWorkloadValidationError, } from "./peer-registry-validation";
export type { PeerWorkloadRejection, PeerWorkloadSave, } from "./peer-registry-validation";

/** One peer as the workload plane sees it. Carries no secret. */
export interface WorkloadPeer {
  origin: string;
  /** Registry lifecycle state (`pending` / `trusted` / `suspended`). */
  state: PeerState;
  displayName: string | null;
  instanceKind: PeerInstanceKind;
  authMode: PeerAuthMode;
  /** Derived from the origin host; never persisted. */
  linkKind: PeerLinkKind;
  /** Default-false grant to execute workloads. */
  workloadTrust: boolean;
  /** Whether chat sessions may pin to this peer. */
  stickyEnabled: boolean;
  /** Operator-declared subset this peer accepts. */
  allowedWorkloadClasses: PeerWorkloadClass[];
  /** Classes the peer actually advertised (observed, from `touchPeer`). */
  advertisedWorkloadClasses: PeerWorkloadClass[];
  /** Whether a workload token is stored — never the token itself. */
  hasSharedToken: boolean;
  capacityBytes: number | null;
}

/** A save request plus the server secret used to encrypt the shared token. */
export interface PeerWorkloadSaveRequest extends PeerWorkloadSave {
  /** `config.byoKey.encryptionKey` — the same secret the BYOK store uses. */
  encryptionKey: string;
}

/**
 * Parse a stored JSON class column. An empty, malformed or non-array value
 * reads back as `[]` with a warning rather than crashing a caller.
 * @param raw
 * @param column
 * @param origin
 * @returns {PeerWorkloadClass[]}
 */
function parseClassColumn(raw: string, column: string, origin: string,): PeerWorkloadClass[] {
  if (raw === "") { return []; }
  const parsed = safeJsonParse<unknown>(raw,);
  if (!parsed.ok) {
    getChildLogger("federation/peer-registry",)?.warn(
      "peer class column is not valid JSON — treated as empty",
      { column, origin, },
    );

    return [];
  }

  return parseAdvertisedClasses(parsed.value,);
}

/**
 * @param row Row shape returned by `listPeers`.
 * @returns {WorkloadPeer}
 */
function toWorkloadPeer(
  row: Awaited<ReturnType<typeof listPeers>>[number],
): WorkloadPeer {
  return {
    origin: row.origin,
    state: row.state as PeerState,
    displayName: row.display_name,
    instanceKind: row.instance_kind,
    authMode: row.auth_mode,
    linkKind: derivedLinkKind(row.origin,) ?? "remote",
    workloadTrust: row.workload_trust === 1,
    stickyEnabled: row.sticky_enabled === 1,
    allowedWorkloadClasses: parseClassColumn(
      row.allowed_workload_classes,
      "allowed_workload_classes",
      row.origin,
    ),
    advertisedWorkloadClasses: parseClassColumn(row.capabilities, "capabilities", row.origin,),
    hasSharedToken: row.shared_token_enc !== null,
    capacityBytes: row.capacity_bytes,
  };
}

/**
 * Registry peers projected onto the workload columns, ordered by origin.
 * @param database
 * @param state Optional registry-state filter.
 * @returns {Promise<WorkloadPeer[]>}
 */
export async function listWorkloadPeers(
  database: Kysely<DB>,
  state?: PeerState,
): Promise<WorkloadPeer[]> {
  const rows = await listPeers(database, state,);
  return rows.map(toWorkloadPeer,);
}

/**
 * Create a peer with its workload metadata. Rejects a duplicate origin, a
 * non-http(s) origin, an out-of-enum class, and any token/link-kind
 * contradiction — see `validatePeerWorkloadSave`.
 * @param database
 * @param request Save input plus the encryption secret.
 * @returns {Promise<WorkloadPeer>} The saved peer, without the token.
 * @throws {PeerWorkloadValidationError}
 */
export async function savePeerWorkload(
  database: Kysely<DB>,
  request: PeerWorkloadSaveRequest,
): Promise<WorkloadPeer> {
  const { encryptionKey, ...save } = request;
  const validated = validatePeerWorkloadSave(save,);

  const encoded = safeJsonStringify(validated.allowedWorkloadClasses,);
  if (!encoded.ok) { throw new Error("peer workload classes not serializable",); }

  const tokenEnc = validated.sharedToken === null
    ? null
    : await encryptValue(validated.sharedToken, encryptionKey,);

  const existing = await database
    .selectFrom("mesh_peers",)
    .select("origin",)
    .where("origin", "=", validated.origin,)
    .executeTakeFirst();

  if (existing !== undefined) {
    throw new PeerWorkloadValidationError(
      "duplicate_origin",
      `peer origin is already registered: ${validated.origin}`,
    );
  }

  await database
    .insertInto("mesh_peers",)
    .values({
      origin: validated.origin,
      display_name: validated.displayName,
      instance_kind: validated.instanceKind,
      auth_mode: validated.authMode,
      workload_trust: validated.workloadTrust,
      allowed_workload_classes: encoded.value,
      sticky_enabled: validated.stickyEnabled,
      shared_token_enc: tokenEnc,
    },)
    .execute();

  const saved = await listWorkloadPeers(database,);
  const peer = saved.find((entry,) => entry.origin === validated.origin);
  if (peer === undefined) { throw new Error(`peer vanished after save: ${validated.origin}`,); }
  return peer;
}

/**
 * Grant or revoke the workload-execution grant. Content replication trust never
 * implies it. Unknown origins are rejected, never silently upserted.
 * @param database
 * @param options
 * @returns {Promise<void>}
 * @throws {Error}
 */
export async function setWorkloadTrust(
  database: Kysely<DB>,
  options: { origin: string; workloadTrust: boolean },
): Promise<void> {
  const result = await database
    .updateTable("mesh_peers",)
    .set({ workload_trust: options.workloadTrust ? 1 : 0, },)
    .where("origin", "=", options.origin,)
    .executeTakeFirst();

  if (Number(result?.numUpdatedRows ?? 0,) === 0) {
    throw new Error(`unknown peer: ${options.origin}`,);
  }
}

/**
 * Replace the set of workload classes a peer accepts. Every entry must be a
 * member of the closed enum.
 * @param database
 * @param options
 * @returns {Promise<void>}
 * @throws {Error}
 */
export async function setAllowedWorkloadClasses(
  database: Kysely<DB>,
  options: { origin: string; classes: readonly PeerWorkloadClass[] },
): Promise<void> {
  const encoded = safeJsonStringify(assertWorkloadClasses(options.classes,),);
  if (!encoded.ok) { throw new Error("peer workload classes not serializable",); }
  const result = await database
    .updateTable("mesh_peers",)
    .set({ allowed_workload_classes: encoded.value, },)
    .where("origin", "=", options.origin,)
    .executeTakeFirst();

  if (Number(result?.numUpdatedRows ?? 0,) === 0) {
    throw new Error(`unknown peer: ${options.origin}`,);
  }
}
