#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Parallel check runner for loop-lore
 * Runs independent checks in parallel and aggregates results
 *
 * Usage:
 *   bun run scripts/check-parallel.mjs [--fix] [--ci] [--report-ls] [--jobs N]
 *   bun run scripts/check-parallel.mjs [--diff-base <ref>] [--gates <csv>] [--skip-gates <csv>]
 *
 * Concurrency cap (added to keep peak RSS sane across multiple worktrees):
 *   --jobs N    Override per-run concurrency cap (default: CHECK_JOBS env, or 1).
 *   CHECK_JOBS  Env override for the same value. The cap controls how many
 *               checks run in parallel; the script still launches all checks,
 *               but processes them in chunks of `jobs` at a time. The default
 *               of 1 is serial: agents finalize worktrees concurrently, and
 *               co-scheduled gates OOM-killed this host (observed kills when a
 *               second worktree ran its own heavy gates at the same time).
 *               Raise it with --jobs N / CHECK_JOBS=N when you want a faster
 *               run and know the box has the headroom to spare.
 *
 * Per-gate timeout (every gate is bounded; the child is killed on expiry):
 *   Default   15 min -- DEFAULT_GATE_TIMEOUT_MS in scripts/check/gate-timeout.mjs.
 *   Per gate  GATE_TIMEOUT_MS below names the gates that need a longer budget;
 *             every other gate gets the default.
 *   Env       CHECK_GATE_TIMEOUT_MS=<ms> raises the default (slow hosts, loaded
 *             CI runners) with no code change. An explicit per-gate budget wins
 *             over the env value.
 *   On expiry the gate's whole process group gets SIGTERM, then SIGKILL after a
 *             5s grace, so workers the gate forked die with it. The gate is
 *             reported FAILED with a message naming the gate and its budget in
 *             ms, appended to the output so report clipping cannot drop it, and
 *             the report entry carries `timedOut: true`.
 *
 * Writes a machine-readable report to .tmp/check-report.json after every run
 * (success: summary only; failure: summary + full failed-check output).
 * The report path is logged to stdout.
 *
 * The report is written atomically (temp file + rename) and carries provenance
 * (branch, head commit, worktree, run id, mode), so concurrent runs across
 * many worktrees never produce torn or ambiguous artifacts.
 *
 * --report-ls: no checks run; aggregates the latest report of every git
 * worktree and flags reports stale w.r.t. that worktree's current HEAD.
 */

// ── Imports ─────────────────────────────────────────────────────

// The runner is split by concern under scripts/check/parallel/; this entry
// only sequences GPG pre-flight, the check sweep, and reporting. Import order
// is load-bearing: module init of config → context/gates/filter → runner
// performs the flag parsing, gate-table build, filter application, and
// concurrency-cap resolution exactly where the monolith did — before main().
import { execFileSync, } from "node:child_process";
import { IS_REPORT_LS, } from "./check/parallel/config.mjs";
import { ensureGpgWarm, gpgPrecheck, } from "./check/parallel/gpg.mjs";
import { runNonBlockingChecks, } from "./check/parallel/nonblocking.mjs";
import { cmdReportLs, } from "./check/parallel/report-ls.mjs";
import { buildReport, reportResults, writeReport, } from "./check/parallel/report.mjs";
import { runAllChecks, } from "./check/parallel/runner.mjs";

// ── Main ────────────────────────────────────────────────────────

async function main() {
  if (IS_REPORT_LS) {
    cmdReportLs();
    return;
  }

  // GPG pre-flight: verify the agent cache is warm via a silent trial
  // sign, warm it via the passphrase source or terminal pinentry if cold,
  // or refuse to start. This must run before any check subprocess so a
  // downstream `git commit` against a cold cache never hangs on a
  // pinentry prompt the harness can't answer.
  await ensureGpgWarm();

  const results = await runAllChecks();
  const failed = reportResults(results,);

  const nonBlocking = [];
  await runNonBlockingChecks(nonBlocking,);

  writeReport(buildReport({
    exitCode: failed > 0 ? 1 : 0,
    checks: results,
    nonBlocking,
    gpgPrecheck: gpgPrecheck.state,
  },),);

  if (failed > 0) {
    console.log(`\n=== ${failed} check(s) failed ===`,);
    process.exit(1,);
  }

  console.log("\n=== All checks passed ===",);
}

// CLI guard: `main()` runs only when this file is executed directly, not when
// a test imports it to unit-test `changedFiles` against a fixture repo.
if (import.meta.main) {
  main().catch((error,) => {
    console.error("error: Check runner failed:", error.message,);
    if (IS_REPORT_LS) { process.exit(1,); }
    writeReport(buildReport({
      exitCode: 1,
      checks: [{
        name: "check - runner",
        command: "bun run scripts/check-parallel.mjs",
        passed: false,
        exitCode: 1,
        durationMs: 0,
        truncated: false,
        output: error.message,
      },],
      nonBlocking: [],
      gpgPrecheck: GPG_PRECHECK_STATE,
    },),);
    process.exit(1,);
  },);
}

/**
 * Paths `git diff --name-only base HEAD` reports, plus uncommitted working-tree
 * changes. Empty when `base` is null.
 *
 * Two-dot (`base`..`HEAD`), not merge-base. The question this answers is
 * "which files will this branch change when it lands on `base`", and only a
 * tree-vs-tree diff answers that. A merge-base diff answers a different
 * question — "which files did EITHER side touch since the fork" — so on a
 * branch that forked a while back it also returns every file `base` moved
 * independently. The coverage gate then floored whole files at the floor for
 * churn this branch never authored, blocking it on debt it did not create.
 *
 * `git diff A B` needs no common ancestor, so dropping the merge-base lookup
 * also removes a crash: `git merge-base` exits non-zero on unrelated
 * histories, which took the whole runner down.
 *
 * Two limits worth knowing before reading scope off this list. It is a
 * SUPERSET of what the merge actually changes, never a subset — a file the two
 * tips hold identically is excluded, but one only `base` moved is still listed
 * (over-scopes, which costs a false red, never a false green). And it only sees
 * TRACKED working-tree changes: `git diff HEAD` omits untracked files, so a new
 * source file that was never `git add`ed is not gated.
 *
 * @param base - Git ref to diff against, or null.
 * @param cwd - Repo root to diff in; defaults to this repo. Exists so tests
 *   can point the diff at a fixture repo.
 * @returns Sorted list of changed paths (repo-relative).
 * @throws {Error} when `base` does not resolve to a commit. This runs at module
 *   init, before `main()`, so the throw is NOT caught by the runner's error
 *   handler and no check report is written. `resolveDiffBase` in
 *   `scripts/worktree/commands/finalize.ts` validates the ref first so the
 *   finalize path fails with a message instead.
 */
export function changedFiles(base, cwd = DIFF_ROOT,) {
  if (!base) { return []; }
  const committed = execFileSync(
    "git",
    ["diff", "--name-only", base, "HEAD",],
    { cwd, encoding: "utf8", },
  );
  const dirty = execFileSync(
    "git",
    ["diff", "--name-only", "HEAD",],
    { cwd, encoding: "utf8", },
  );
  return [...new Set(`${committed}\n${dirty}`.split("\n",).map((f,) => f.trim()).filter(Boolean,),),].sort();
}
