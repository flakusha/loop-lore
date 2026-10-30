// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/resource/recovery.ts — user-confirmed recovery + backup rotation.
//
// Recovery is user-confirmed for every merge decision, never silent: the
// caller passes a confirm callback (a dashboard checkbox/dialog) and the
// restore refuses without it. Rotation keeps the N most recent backups per
// resource. Pure: no I/O, no browser APIs.

import { safeJsonParse, } from "../utils";
import { type BackupRecord, hashPayload, verifyBackup, } from "./browser-backup";

/** Explicit user confirmation — never default it to true. */
export type ConfirmFn = (record: BackupRecord,) => boolean | Promise<boolean>;

/** What the user chose to restore into (chat store, asset dir, …). */
export interface RecoveryTarget {
  applyPayload(resourceId: string, data: unknown,): void | Promise<void>;
}

export interface RecoverResult {
  restored: boolean;
  reason: string;
}

/**
 * Restore one verified backup into the target after explicit confirmation.
 * @returns restored:false when confirmation is missing/declined or the
 * blob fails its integrity check — before touching the target.
 */
export async function recoverRecord(
  record: BackupRecord,
  target: RecoveryTarget,
  confirm: ConfirmFn,
): Promise<RecoverResult> {
  if (!verifyBackup(record,)) {
    return { restored: false, reason: "integrity check failed: payload hash mismatch", };
  }

  if (!(await confirm(record,))) {
    return { restored: false, reason: "recovery requires explicit user confirmation", };
  }

  const payload = safeJsonParse<unknown>(record.payload,);
  if (!payload.ok) { return { restored: false, reason: "integrity check failed: payload is not valid JSON", }; }
  await target.applyPayload(record.resourceId, payload.value,);
  return { restored: true, reason: `restored ${record.resourceId} v${record.version}`, };
}

/**
 * Keep the N most recent backups per resource (by createdAt desc, then
 * version desc); returns the records to retain. N <= 0 keeps nothing.
 * // ponytail: O(n log n) sort per resource, fine for browser backup counts.
 */
export function rotateBackups(records: BackupRecord[], keep: number,): BackupRecord[] {
  if (keep <= 0) { return []; }
  const byResource = new Map<string, BackupRecord[]>();
  for (const record of records) {
    const group = byResource.get(record.resourceId,) ?? [];
    group.push(record,);
    byResource.set(record.resourceId, group,);
  }

  const retained: BackupRecord[] = [];
  for (const group of byResource.values()) {
    group.sort((a, b,) =>
      b.createdAt.localeCompare(a.createdAt,) || b.version - a.version || b.id.localeCompare(a.id,)
    );

    retained.push(...group.slice(0, keep,),);
  }

  return retained;
}

/** Re-hash helper for the “overwrite-server” direction: new canonical hash. */
export function rehashForServer(record: BackupRecord,): string {
  return hashPayload(record.payload,);
}
