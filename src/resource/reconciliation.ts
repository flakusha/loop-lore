// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/resource/reconciliation.ts — background hash reconciliation.
//
// Re-hashes the stored blob and compares against the canonical server hash
// (X-Record-Hash), classifying each record per the epic table:
// consistent / drifted / orphaned / stale. Pure: no I/O, no browser APIs.

import { type BackupRecord, hashPayload, verifyBackup, } from "./browser-backup";

/** Reconciliation outcome per epic-resource-provision.md. */
export type ReconcileStatus = "consistent" | "drifted" | "orphaned" | "stale";

/** Canonical server-side state for one resource (absent = no counterpart). */
export interface ServerState {
  serverHash?: string;
  serverVersion?: number;
}

/** User-facing per-item drift report entry. */
export interface DriftReportEntry {
  recordId: string;
  resourceId: string;
  status: ReconcileStatus;
  /** Suggested next step shown in the dashboard. */
  action: string;
  detail: string;
}

const ACTIONS: Record<ReconcileStatus, string> = {
  consistent: "no-op",
  drifted: "restore-from-server or overwrite-server",
  orphaned: "push (create server counterpart)",
  stale: "pull (update local)",
};

/**
 * Classify one record against its server counterpart.
 * A locally tampered blob (payload no longer matches contentHash) counts
 * as drifted — the stored copy cannot be trusted either way.
 */
export function reconcileRecord(record: BackupRecord, server: ServerState,): ReconcileStatus {
  if (!verifyBackup(record,)) { return "drifted"; }
  if (server.serverHash === undefined && server.serverVersion === undefined) { return "orphaned"; }
  if (server.serverVersion !== undefined && record.version < server.serverVersion) { return "stale"; }
  if (server.serverHash !== undefined && hashPayload(record.payload,) !== server.serverHash) {
    return "drifted";
  }

  return "consistent";
}

/** Reconcile a batch into a user-facing drift report. */
export function reconcileAll(
  records: BackupRecord[],
  serverByResourceId: Map<string, ServerState> | Record<string, ServerState>,
): DriftReportEntry[] {
  const lookup = serverByResourceId instanceof Map
    ? (id: string,) => serverByResourceId.get(id,)
    : (id: string,) => serverByResourceId[id];

  return records.map((record,) => {
    const status = reconcileRecord(record, lookup(record.resourceId,) ?? {},);
    return {
      recordId: record.id,
      resourceId: record.resourceId,
      status,
      action: ACTIONS[status],
      detail: status === "consistent"
        ? `local hash matches server hash ${record.contentHash.slice(0, 12,)}…`
        : `local ${record.contentHash.slice(0, 12,)}… vs server ${
          (lookup(record.resourceId,)?.serverHash ?? "none").slice(0, 12,)
        }…`,
    };
  },);
}
