// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Retention GC for the parallel check runner: prune old per-run reports and
 * per-run scratch dirs beyond REPORT_RETENTION_COUNT. Never touches the
 * canonical report, the `.latest` symlink target, the current run, or any
 * artifact younger than MIN_DELETE_AGE_MS (a concurrent run's fresh files).
 */

// oxlint-disable-next-line import/no-nodejs-modules
import {
  existsSync,
  lstatSync,
  readdirSync,
  readlinkSync,
  rmSync,
  unlinkSync,
} from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules
import path from "node:path";
import {
  PROJECT_ROOT,
  REPORT_DIR_RELATIVE,
  REPORT_LATEST_PATH,
  REPORT_RETENTION_COUNT,
  RUN_TMP_DIR_RELATIVE,
} from "./config.mjs";

// A run that is still in flight can have written its per-run report or scratch
// dir seconds ago; deleting either out from under it is the failure this guard
// exists to prevent. 24h is far longer than any single gate's budget (15 min
// default, 45 min max) and far shorter than the 20-run retention window, so it
// never blocks legitimate GC — it only protects the freshly written.
const MIN_DELETE_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Order entries newest-first by mtime, NOT by name. RUN_ID is
 * `<pid>-<base36 time>`, so a lexicographic compare decides on the PID before
 * it ever looks at the timestamp: a low-pid run from this week sorted older
 * than a high-pid run from last month, and retention pruned the wrong files.
 * mtime is the only ordering that matches when the run actually wrote.
 *
 * A stat failure (entry vanished mid-listing) sorts the entry OLDEST so it is
 * never protected from GC by an ordering accident.
 */
function newestFirstByMtime(dir, names,) {
  return names
    .map((name,) => {
      let mtimeMs = 0;
      try {
        mtimeMs = lstatSync(path.join(dir, name,),).mtimeMs;
      } catch { /* vanished or unreadable -> oldest */ }
      return { name, mtimeMs, };
    },)
    .sort((a, b,) => b.mtimeMs - a.mtimeMs)
    .map((e,) => e.name);
}

/**
 * True when the entry is old enough to be GC'd. Anything younger than
 * MIN_DELETE_AGE_MS is protected no matter how far the count is exceeded —
 * with concurrent runs writing their own reports, a count-only rule deletes a
 * sibling's fresh artifacts.
 */
function oldEnoughToDelete(dir, name, nowMs,) {
  try {
    return nowMs - lstatSync(path.join(dir, name,),).mtimeMs > MIN_DELETE_AGE_MS;
  } catch {
    return false; // vanished mid-listing -> nothing to delete
  }
}

/**
 * Prune oldest per-run reports beyond `REPORT_RETENTION_COUNT`. The canonical
 * `check-report.json` and `.latest.json` symlink are never touched — only
 * `check-report-<RUN_ID>.json` files are GC'd, ordered by mtime (see
 * `newestFirstByMtime`), and nothing younger than MIN_DELETE_AGE_MS is
 * reaped however far the count is exceeded.
 */
export function pruneOldReports(targetDir = path.resolve(PROJECT_ROOT, REPORT_DIR_RELATIVE,),) {
  const dir = targetDir;
  let entries;
  try {
    entries = readdirSync(dir,);
  } catch {
    return; // dir missing → nothing to prune
  }
  // `.latest.json` is a symlink to one of the per-run files. Resolve it
  // so retention never deletes the file it currently points at (would
  // leave a dangling symlink for downstream consumers reading the stable
  // filename). `try` because the symlink may not exist yet (very first
  // run) or may already be broken (a previous bug left it dangling —
  // writeReport step 3 atomically replaces the symlink on the next run,
  // healing it without this function needing to).
  let latestTarget = null;
  if (existsSync(REPORT_LATEST_PATH,)) {
    try {
      latestTarget = readlinkSync(REPORT_LATEST_PATH,);
    } catch {
      // dangling symlink or unreadable — writeReport step 3 heals
      // on the next invocation; nothing to protect here.
    }
  }
  const perRun = newestFirstByMtime(
    dir,
    entries.filter((name,) =>
      name.startsWith("check-report-",) &&
      name.endsWith(".json",) &&
      name !== "check-report.json" &&
      name !== "check-report.latest.json" &&
      name !== latestTarget
    ),
  );
  if (perRun.length <= REPORT_RETENTION_COUNT) { return; }
  const now = Date.now();
  const toDelete = perRun.slice(REPORT_RETENTION_COUNT,);
  for (const name of toDelete) {
    const target = path.join(dir, name,);
    try {
      // Defensive: never delete a symlink (the `.latest` filter above is
      // belt-and-suspenders). lstatSync, NOT statSync: stat follows the link
      // and reports the TARGET's mode, so isSymbolicLink() never fired and the
      // link was unlinked (a dangling-link hazard) instead of skipped.
      if (lstatSync(target,).isSymbolicLink()) { continue; }
      // Age guard: never GC a fresh artifact. A concurrent run's report was
      // written seconds ago and is not ours to reap (B9).
      if (!oldEnoughToDelete(dir, name, now,)) { continue; }
      unlinkSync(target,);
    } catch { /* best-effort GC; race with concurrent prune is harmless */ }
  }
}

/**
 * Same retention policy as `pruneOldReports`, but applied to per-tool
 * scratch dirs created under `.tmp/run-<RUN_ID>/`. Coverage and jscpd
 * both write into those dirs, so capping their footprint keeps `.tmp/`
 * from growing unbounded across many check runs.
 *
 * Only the directories themselves are GC'd; symlinks (defensive: there
 * shouldn't be any today) are skipped, matching `pruneOldReports`.
 */
export function pruneOldRunTmpDirs(targetDir = path.resolve(PROJECT_ROOT, REPORT_DIR_RELATIVE,),) {
  const dir = targetDir;
  let entries;
  try {
    entries = readdirSync(dir,);
  } catch {
    return; // .tmp/ missing → nothing to prune
  }
  // run-<RUN_ID> directories, newest first by mtime (NOT by name — RUN_ID
  // embeds the pid ahead of the timestamp, so lexicographic order is wrong).
  const perRun = newestFirstByMtime(
    dir,
    entries.filter((name,) =>
      name.startsWith("run-",) && name !== RUN_TMP_DIR_RELATIVE.slice(REPORT_DIR_RELATIVE.length + 1,)
    ),
  );
  if (perRun.length === 0) { return; }
  // Always keep the current run; prune oldest beyond the retention budget.
  const keepCurrent = 1;
  const now = Date.now();
  const toDelete = perRun.slice(Math.max(0, REPORT_RETENTION_COUNT - keepCurrent,),);
  for (const name of toDelete) {
    const target = path.join(dir, name,);
    try {
      if (lstatSync(target,).isSymbolicLink()) { continue; }
      // Age guard: a concurrent run's scratch dir is in use right now; its
      // mtime is seconds old. Never reap a fresh one (B9).
      if (!oldEnoughToDelete(dir, name, now,)) { continue; }
      rmSync(target, { recursive: true, force: true, },);
    } catch { /* best-effort GC; harmless to skip on race */ }
  }
}
