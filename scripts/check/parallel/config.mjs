// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-run configuration for the parallel check runner: project paths, the
 * machine-readable report locations, per-RUN scratch dirs, invocation mode,
 * and the parallelism knobs. Declarations only — no I/O side effects.
 */

// oxlint-disable-next-line import/no-nodejs-modules
import path from "node:path";

// ── Run checks in parallel ──────────────────────────────────────

export const PROJECT_ROOT = path.resolve(import.meta.dir, "../../..",),
  // Machine-readable report: written after every run, git-ignored (.tmp/).
  REPORT_DIR_RELATIVE = ".tmp",
  // Canonical (latest-run) report path. Updated atomically on every run;
  // consumers that only care about "the most recent report" read this file.
  REPORT_RELATIVE = ".tmp/check-report.json",
  REPORT_PATH = path.resolve(PROJECT_ROOT, REPORT_DIR_RELATIVE, "check-report.json",),
  // `.latest` symlink always points at the per-run filename written for the
  // most recent run, so external tools that don't know RUN_ID can chase a
  // stable filename. Symlink target is updated atomically via temp + rename.
  REPORT_LATEST_PATH = path.resolve(PROJECT_ROOT, ".tmp/check-report.latest.json",),
  // Per-run retention: how many historical `.tmp/check-report-<RUN_ID>.json`
  // files to keep. Older reports are pruned on each new run. ~200KB per
  // report × 20 = ~4MB worst-case disk footprint per worktree, auto-GC'd.
  REPORT_RETENTION_COUNT = 20,
  // Per-check output cap for the report (guards against multi-MB failure dumps).
  MAX_OUTPUT_CHARS = 100_000,
  // Run identity: unique per invocation; embedded in the report, used as the
  // per-run filename, and used to make the on-disk write atomic. Declared
  // before the per-tool scratch dirs because they embed it in their paths.
  RUN_ID = `${process.pid}-${Date.now().toString(36,)}`,
  // Per-tool scratch dir under .tmp/, keyed by RUN_ID so concurrent or
  // successive runs do not clobber each other's coverage/jscpd output.
  // The paths are exposed as `CHECK_REPORT_COVERAGE_LCOV` /
  // `CHECK_REPORT_JSCPD` for downstream consumers and pruned alongside the
  // check-report retention count to keep disk usage bounded.
  RUN_TMP_DIR_RELATIVE = `.tmp/run-${RUN_ID}`,
  RUN_TMP_DIR = path.resolve(PROJECT_ROOT, RUN_TMP_DIR_RELATIVE,),
  // Sub-paths consumed by `scripts/check/coverage.mjs` and the jscpd ratchet
  // gate (`scripts/check/jscpd-ratchet.mjs`).
  COVERAGE_DIR_RELATIVE = `${RUN_TMP_DIR_RELATIVE}/coverage`,
  COVERAGE_DIR = path.resolve(PROJECT_ROOT, COVERAGE_DIR_RELATIVE,),
  COVERAGE_LCOV = path.resolve(PROJECT_ROOT, COVERAGE_DIR_RELATIVE, "lcov.info",),
  JSCPD_DIR_RELATIVE = `${RUN_TMP_DIR_RELATIVE}/jscpd`,
  JSCPD_DIR = path.resolve(PROJECT_ROOT, JSCPD_DIR_RELATIVE,),
  JSCPD_REPORT_RELATIVE = `${JSCPD_DIR_RELATIVE}/jscpd-report.json`,
  JSCPD_REPORT = path.resolve(PROJECT_ROOT, JSCPD_REPORT_RELATIVE,),
  // Per-run file path. Same JSON content as REPORT_PATH at any given moment.
  PER_RUN_REPORT_PATH = path.resolve(
    PROJECT_ROOT,
    REPORT_DIR_RELATIVE,
    `check-report-${RUN_ID}.json`,
  ),
  // Invocation mode — the runner is mode-agnostic; the label only records
  // how the check was invoked so fix/ci runs can't masquerade as plain ones.
  MODE = (() => {
    if (process.argv.includes("--ci",)) { return "ci"; }
    if (process.argv.includes("--fix",)) { return "fix"; }
    return "plain";
  })(),
  // Parallelism for the heavy `bun test` gates: `--parallel=N` hands test
  // FILES to N worker processes (per-file fresh globals; `--isolate` stays
  // for the non-parallel path and is compatible). Without it, isolate runs
  // are strictly sequential on one core — a 7-module scoped diff burned
  // 20-60+ min and made `giwt finalize` unfinishable under any caller
  // timeout (observed SIGTERM kills at 5/10/60 min, exit 143). Cap is
  // deliberately modest: whole heavy gates peak multi-GB RSS and two
  // co-scheduled gates OOM'd this host before; per-file workers are far
  // smaller, but 4-way bounds peak memory on multi-worktree hosts.
  // Override with CHECK_TEST_JOBS=N.
  TEST_JOBS = process.env.CHECK_TEST_JOBS ?? "4",
  IS_REPORT_LS = process.argv.includes("--report-ls",);
