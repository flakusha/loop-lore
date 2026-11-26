// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Legacy backup-pool finder and warning.
 *
 * Before the per-instance state dir, the reinit archive pool was the SIBLING
 * of the legacy data dir: `<DATA_DIR>/../loop-lore-data-backup` (historically
 * `packages/core/loop-lore-data-backup/`). Nothing reads that pool any more,
 * so an operator's rollback points would sit there unmentioned — the legacy
 * DATABASE warns, the backup pool did not.
 */

import { existsSync, } from "node:fs";
import path from "node:path";
import { LEGACY_DATA_DIRS, } from "../config/state-dir";
import { getChildLogger, } from "../logger";

/** Dir name of the legacy backup pool — the sibling of the legacy data dir. */
export const LEGACY_BACKUP_POOL_DIR_NAME = "loop-lore-data-backup";

/**
 * The legacy backup-pool candidates: the sibling of every legacy data dir.
 * @returns the candidate dirs, in check order
 */
export function legacyBackupPoolCandidates(): string[] {
  return LEGACY_DATA_DIRS.map((dir,) => path.join(dir, "..", LEGACY_BACKUP_POOL_DIR_NAME,));
}

/**
 * The first legacy backup pool that exists on disk.
 * @param candidates - candidate dirs, defaults to {@link legacyBackupPoolCandidates}
 * @returns the legacy pool path, or null when none exists
 */
export function findLegacyBackupPool(
  candidates: readonly string[] = legacyBackupPoolCandidates(),
): string | null {
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate,)) { return candidate; }
    } catch {
      // Unreadable dir (perms) — not a pool we can point at.
    }
  }

  return null;
}

/** The legacy backup-pool warning fires at most once per process. */
let warned = false;

/** Test-only reset for the once-per-process warning. */
export function resetLegacyBackupPoolWarningForTests(): void {
  warned = false;
}

/**
 * Point the operator at the legacy backup pool once per process.
 * Docs-only migration: never moves anything, just prints the exact `cp -a`.
 * @param pool - the legacy pool found on disk, or null when there is none
 * @param archiveRoot - the instance archive root the runtime writes to now
 * @returns the emitted warning, or null when nothing was emitted
 */
export function warnLegacyBackupPoolOnce(pool: string | null, archiveRoot: string,): string | null {
  if (pool === null || warned) {
    return null;
  }

  warned = true;
  const message = `[loop-lore] Legacy backup pool found at ${pool} — runtime archives now live under ${archiveRoot}. ` +
    `Move it with: cp -a ${pool}/. ${archiveRoot}/ (then remove the legacy copy). No auto-migration is performed.`;

  const logger = getChildLogger("db-legacy-backup-pool",);
  if (logger !== null) {
    logger.warn(message, { legacyPool: pool, archiveRoot, },);
  } else {
    // console, not the app logger: this fires before logging is initialized
    // (getDatabase runs during boot and in logger-less tests).
    // eslint-disable-next-line no-console
    console.warn(message,);
  }

  return message;
}
