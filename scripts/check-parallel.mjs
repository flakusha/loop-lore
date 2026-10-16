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
 * Concurrency cap (keeps peak RSS sane across multiple worktrees):
 *   --jobs N    Override per-run concurrency cap (default: CHECK_JOBS env,
 *               or DEFAULT_JOBS in check/parallel/runner.mjs).
 *   CHECK_JOBS  Env override for the same value. The cap controls how many
 *               checks run in parallel; the script still launches all checks,
 *               but processes them in chunks of `jobs` at a time.
 *   Default    4. The original default of 1 was chosen because co-scheduled
 *               gates OOM-killed this host. It is safe to raise for the LIGHT
 *               pool because the gates that actually OOM the box are excluded
 *               from it: eslint, unit, e2e and coverage sit in HEAVY_NAMES
 *               (check/parallel/runner.mjs) and run strictly one at a time
 *               after the light chunk, so a wider light chunk cannot
 *               co-schedule them with anything.
 *               Measured on this host, eslint (bunx eslint src/, no cache):
 *               --concurrency=off 3.6 GB, =1 3.6 GB, =2 6.9 GB, =4 12.4 GB
 *               peak RSS; =4 --cache warm re-run 1.5 GB. `--cache` makes the
 *               WARM run cheap, but a COLD cache still peaks ~12 GB — hence
 *               eslint staying in the serial tail, not the light pool.
 *               Heavy gates (unit/e2e/coverage/eslint) run strictly serial
 *               regardless of this cap; two of those at once is what OOMs the
 *               box. Raise the cap above the default with --jobs N /
 *               CHECK_JOBS=N when you want a faster run and know the box has
 *               the headroom to spare — and remember that N worktrees each
 *               pay their own chunk, so two finalizing worktrees are 8 light
 *               gates, not 4.
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

  // `failed` excludes advisory gates by design (see ADVISORY_GATES in
  // check/parallel/gates.mjs), so a run with a red advisory gate reaches here
  // with failed === 0. Printing "All checks passed" then is the blind spot: an
  // auditor skims the terminal line and concludes the suite is green. Exit code
  // is deliberately unchanged — advisory gates must not fail the run.
  const advisoryFailed = results.filter((r,) => r.advisory && !r.passed && !r.skipped).length;
  if (advisoryFailed > 0) {
    console.log(
      `\n=== All blocking checks passed, but ${advisoryFailed} ADVISORY gate(s) failed ===`,
    );
    console.log("!!! This run is NOT green. See the ADVISORY entries above.",);
  } else {
    console.log("\n=== All checks passed ===",);
  }
}

// CLI guard: `main()` runs only when this file is executed directly, so an
// import (tests, tooling) never kicks off the gate suite as a side effect.
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
      gpgPrecheck: gpgPrecheck.state,
    },),);
    process.exit(1,);
  },);
}
