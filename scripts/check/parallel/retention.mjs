// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Retention GC for the parallel check runner: prune old per-run reports and
 * per-run scratch dirs beyond REPORT_RETENTION_COUNT. Never touches the
 * canonical report, the `.latest` symlink target, or the current run.
 */

// oxlint-disable-next-line import/no-nodejs-modules
import {
  existsSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
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

/**
 * Prune oldest per-run reports beyond `REPORT_RETENTION_COUNT`. The canonical
 * `check-report.json` and `.latest.json` symlink are never touched — only
 * `check-report-<RUN_ID>.json` files are GC'd. RUN_IDs embed `<pid>-<base36-time>`
 * so lexicographic sort is also chronological within a single worktree.
 */
export function pruneOldReports() {
  const dir = path.resolve(PROJECT_ROOT, REPORT_DIR_RELATIVE,);
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
  const perRun = entries
    .filter((name,) =>
      name.startsWith("check-report-",) &&
      name.endsWith(".json",) &&
      name !== "check-report.json" &&
      name !== "check-report.latest.json" &&
      name !== latestTarget
    )
    .sort((a, b,) => b.localeCompare(a,)); // newest first
  if (perRun.length <= REPORT_RETENTION_COUNT) { return; }
  const toDelete = perRun.slice(REPORT_RETENTION_COUNT,);
  for (const name of toDelete) {
    const target = path.join(dir, name,);
    try {
      // Defensive: never delete a symlink (the `.latest` filter above is
      // belt-and-suspenders). Avoids following a symlink and unlinking an
      // arbitrary target if a future naming change makes one slip through.
      const st = statSync(target,);
      if (st.isSymbolicLink()) { continue; }
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
export function pruneOldRunTmpDirs() {
  const dir = path.resolve(PROJECT_ROOT, REPORT_DIR_RELATIVE,);
  let entries;
  try {
    entries = readdirSync(dir,);
  } catch {
    return; // .tmp/ missing → nothing to prune
  }
  // run-<RUN_ID> directories, sorted by RUN_ID (which embeds pid + time,
  // so lexicographic sort is chronological within a single worktree).
  const perRun = entries
    .filter((name,) => name.startsWith("run-",) && name !== RUN_TMP_DIR_RELATIVE.slice(REPORT_DIR_RELATIVE.length + 1,))
    .sort((a, b,) => b.localeCompare(a,));
  if (perRun.length === 0) { return; }
  // Always keep the current run; prune oldest beyond the retention budget.
  const keepCurrent = 1;
  const toDelete = perRun.slice(Math.max(0, REPORT_RETENTION_COUNT - keepCurrent,),);
  for (const name of toDelete) {
    const target = path.join(dir, name,);
    try {
      const st = statSync(target,);
      if (st.isSymbolicLink()) { continue; }
      rmSync(target, { recursive: true, force: true, },);
    } catch { /* best-effort GC; harmless to skip on race */ }
  }
}
