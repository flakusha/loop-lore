// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Archive retention helpers shared by {@link ./reinit.ts}.
 *
 * BUG-db-reinit-archive-directory-has-no-rotation: without these limits,
 * production reinits accumulate full plaintext PII snapshots forever.
 * Both limits are env-overridable for operations tuning.
 */
import { mkdirSync, readdirSync, renameSync, statSync, unlinkSync, } from "node:fs";
import path from "node:path";
import { DATA_DIR, } from "../config/constants";
import type { Logger, } from "../logger";
import { toDate, } from "../utils/date";

export const MAX_ARCHIVES = Number(process.env.LOOP_LORE_REINIT_MAX_ARCHIVES ?? 10,);
export const MAX_AGE_DAYS = Number(process.env.LOOP_LORE_REINIT_MAX_AGE_DAYS ?? 90,);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Resolve the archive directory. Env override beats the data-dir sibling —
 * operations may store archives on a separate volume (e.g. cheap object
 * storage) to keep the data volume small. */
export function archiveDir(): string {
  return process.env.LOOP_LORE_BACKUP_DIR ??
    path.resolve(DATA_DIR, "..", "loop-lore-data-backup",);
}

/** Move `p` into the timestamped backup dir; fall back to unlink on
 * cross-device rename. After the move, retention is enforced via
 * {@link pruneArchives}. */
export function archiveFile(p: string, log: Logger,): void {
  const dir = archiveDir();
  mkdirSync(dir, { recursive: true, },);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-",);
  try {
    renameSync(p, path.join(dir, `${stamp}-${path.basename(p,)}`,),);
  } catch (err) {
    log.warn(`Could not archive ${p} (${String(err,)}); removing instead`,);
    unlinkSync(p,);
  }
  pruneArchives(dir, log,);
}

/** Parse the moved-at timestamp from an archive filename. Returns null when
 * the name does not match the `<iso-stamp>-<original>` pattern produced by
 * {@link archiveFile}. Exported for tests. */
export function parseArchiveStamp(name: string,): Date | null {
  // Filesystem-safe stamp: `2026-09-15T10-17-08-123Z` → ISO `2026-09-15T10:17:08.123Z`.
  // ISO uses `:` for the time fields and `.` for milliseconds — filename uses
  // `-` for both, so they need a structured conversion rather than a global replace.
  const m = name.match(/^(\d{4}-\d{2}-\d{2}T)(\d{2})-(\d{2})-(\d{2})-(\d{3})(Z?)-/,);
  if (!m) { return null; }
  const tz = m[6] ?? "";
  const iso = `${m[1]}${m[2]}:${m[3]}:${m[4]}.${m[5]}${tz}`;
  const d = toDate(iso,);
  return Number.isNaN(d.getTime(),) ? null : d;
}

/** Minimal shape needed by {@link pruneArchives}. */
interface ArchiveEntry {
  stamp: Date;
  path: string;
}

/** Enforce {@link MAX_ARCHIVES} + {@link MAX_AGE_DAYS} retention on `dir`.
 * Files without a parseable stamp prefix are left untouched so unrelated
 * files in the backup dir are not deleted. */
export function pruneArchives(dir: string, log: Logger,): void {
  let entries: ArchiveEntry[];
  try {
    entries = readdirSync(dir,)
      .map((name,): ArchiveEntry | null => {
        const stamp = parseArchiveStamp(name,);
        return stamp === null ? null : { stamp, path: path.join(dir, name,), };
      },)
      .filter((e,): e is ArchiveEntry => e !== null);
  } catch (err) {
    log.warn(`Could not read backup dir ${dir} for pruning (${String(err,)}); skipping`,);
    return;
  }
  const cutoff = Date.now() - MAX_AGE_DAYS * MS_PER_DAY;
  // Oldest first — drop oldest beyond MAX_ARCHIVES, plus anything past cutoff.
  entries.sort((a, b,) => a.stamp.getTime() - b.stamp.getTime());
  const excess = Math.max(0, entries.length - MAX_ARCHIVES,);
  const toDrop = new Set<string>(entries.slice(0, excess,).map((e,) => e.path),);
  for (const e of entries) {
    if (e.stamp.getTime() < cutoff) { toDrop.add(e.path,); }
  }
  for (const target of toDrop) {
    try {
      const ageDays = (Date.now() - statSync(target,).mtimeMs) / MS_PER_DAY;
      unlinkSync(target,);
      log.info(
        `pruned archive ${target} (age ${ageDays.toFixed(1,)}d, ` +
          `retention cap ${MAX_ARCHIVES} / ${MAX_AGE_DAYS}d)`,
      );
    } catch (err) {
      log.warn(`Could not prune ${target} (${String(err,)}); leaving in place`,);
    }
  }
}
