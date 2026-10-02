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
    gpgPrecheck: gpgPrecheck.state,
  },),);
  process.exit(1,);
},);
