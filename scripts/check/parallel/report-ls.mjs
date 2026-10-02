// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `--report-ls` mode: aggregate the latest check report of every git
 * worktree and flag stale/corrupt/missing ones. No checks are run.
 */

// oxlint-disable-next-line import/no-nodejs-modules
import { execFileSync, } from "node:child_process";
// oxlint-disable-next-line import/no-nodejs-modules
import { existsSync, readdirSync, readFileSync, } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules
import path from "node:path";
import { PROJECT_ROOT, REPORT_DIR_RELATIVE, } from "./config.mjs";
import { GIT_BIN, } from "./git-context.mjs";

// ── Report aggregation (--report-ls) ────────────────────────────

/**
 * Aggregate the latest check report of every git worktree.
 * Flags reports whose gitHead no longer matches that worktree's current HEAD,
 * so a batch of concurrently-checked worktrees can be reviewed in one shot.
 */
export function cmdReportLs() {
  const out = execFileSync(GIT_BIN, ["worktree", "list", "--porcelain",], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore",],
  },);

  const worktrees = [];
  let current = null;
  for (const line of out.split("\n",)) {
    if (line === "") {
      current = null;
      continue;
    }
    if (line.startsWith("worktree ",)) {
      current = { path: line.slice("worktree ".length,), head: "", branch: "", };
      worktrees.push(current,);
    } else if (current !== null && line.startsWith("HEAD ",)) {
      current.head = line.slice("HEAD ".length,);
    } else if (current !== null && line.startsWith("branch ",)) {
      current.branch = line.slice("branch ".length,).replace(/^refs\/heads\//, "",);
    }
  }

  console.log("=== Check reports across worktrees ===",);
  console.log(
    `${"worktree".padEnd(32,)} ${"branch".padEnd(28,)} ${"head".padEnd(8,)} ${"report".padEnd(8,)} ${
      "kept".padEnd(5,)
    } status`,
  );
  for (const wt of worktrees) {
    const reportPath = path.join(wt.path, REPORT_DIR_RELATIVE, "check-report.json",);
    let report = null;
    let corrupt = false;
    try {
      report = JSON.parse(readFileSync(reportPath, "utf8",),);
    } catch {
      corrupt = existsSync(reportPath,);
    }

    // Count historical per-run reports retained on disk. Used to surface
    // worktrees that are filling `.tmp/` (e.g. CI churning through 100s of
    // runs without manual cleanup). Retention cap is REPORT_RETENTION_COUNT
    // but each worktree runs its own GC; the column exposes the current
    // population so operators can spot retention policy violations.
    const tmpDir = path.join(wt.path, REPORT_DIR_RELATIVE,);
    let kept = 0;
    try {
      kept = readdirSync(tmpDir,).filter((n,) =>
        n.startsWith("check-report-",) && n.endsWith(".json",) &&
        n !== "check-report.json" && n !== "check-report.latest.json"
      ).length;
    } catch { /* dir missing → 0 */ }

    const head = wt.head.slice(0, 7,);
    let status;
    if (corrupt) { status = "CORRUPT"; }
    else if (report === null) { status = "no-report"; }
    else if (report.gitHead && !wt.head.startsWith(report.gitHead,)) { status = "STALE"; }
    else if (report.passed === true) {
      // A skipped gate was not evaluated (see GIWT_ISSUE_CLI_UNAVAILABLE) -
      // surface it instead of letting the row read as a clean pass.
      const skipped = report.summary?.skipped ?? 0;
      status = skipped > 0 ? `pass (${skipped} skipped)` : "pass";
    } else { status = "FAIL"; }

    const reportHead = report?.gitHead ?? "-";
    const name = path.basename(wt.path,).padEnd(32,);
    const branch = (wt.branch || "(detached)").padEnd(28,);
    console.log(
      `${name} ${branch} ${head.padEnd(8,)} ${reportHead.padEnd(8,)} ${String(kept,).padEnd(5,)} ${status}`,
    );
  }
}
