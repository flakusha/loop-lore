// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Reporting for the parallel check runner: stdout verdicts with fail-log
 * capture, the machine-readable report build, and the atomic write plus the
 * machine-greppable CHECK_REPORT_* stdout contract. Retention GC lives in
 * retention.mjs.
 */

// oxlint-disable-next-line import/no-nodejs-modules
import {
  existsSync,
  mkdirSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules
import path from "node:path";
import {
  COVERAGE_LCOV,
  JSCPD_REPORT,
  MAX_OUTPUT_CHARS,
  MODE,
  PER_RUN_REPORT_PATH,
  PROJECT_ROOT,
  REPORT_DIR_RELATIVE,
  REPORT_LATEST_PATH,
  REPORT_PATH,
  REPORT_RELATIVE,
  RUN_ID,
  RUN_TMP_DIR,
} from "./config.mjs";
import { NOOP_OK, } from "./context.mjs";
import { GIT_CONTEXT, } from "./git-context.mjs";
import { pruneOldReports, pruneOldRunTmpDirs, } from "./retention.mjs";
import { GIWT_ISSUE_CLI_UNAVAILABLE, } from "./runner.mjs";

// Keep the TAIL of a failing gate's output. Failure details and summaries come
// last; gates that print thousands of advisory lines first (e.g. giwt's
// placeholder-hash list) otherwise push the actionable text past the cap.
function clipOutput(text, limit,) {
  if (text.length <= limit) { return text; }
  // Keep a head as well as the tail. A red gate's cause is not always at the
  // end: tsc/bun print the first error early and keep going, and a gate killed
  // by the OOM killer or a timeout has no verdict of its own to end on. The old
  // tail-only clip threw the head away, so the first diagnostic of a long gate
  // was unreachable without a re-run. Half the budget each side, since neither
  // half alone is the whole story.
  const head = Math.floor(limit / 2,),
    tail = limit - head,
    elided = text.length - limit;
  return `${text.slice(0, head,)}\n... (${elided} earlier chars elided; ${head} head + ${tail} tail chars kept) ...\n${
    text.slice(-tail,)
  }`;
}

export function reportResults(results,) {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let advisory = 0;

  for (const result of results) {
    if (result.skipped) {
      console.log(`SKIP: ${result.name}`,);
      // Two distinct causes reach this branch (see runCheck): the issue CLI
      // being unreachable, and a NOOP_OK command. Printing the giwt marker for
      // both would attribute a no-op gate to giwt, so they get separate lines.
      // NOOP_OK is deliberately cause-agnostic - the weave gate emits it when
      // WEAVE_BASE is unset, the coverage/e2e builders emit it when the diff
      // scope matches nothing - so this line names the condition, not a cause
      // it cannot actually see. A skip that misattributes itself is worse
      // than one that stays general.
      if (result.command === NOOP_OK) {
        console.log(
          `  no-op gate (${NOOP_OK}) - nothing to evaluate. ` +
            `Re-run without --diff-base, or with a base that touches this gate.`,
        );
      } else {
        console.log(
          `  ${GIWT_ISSUE_CLI_UNAVAILABLE} - the gate could not be evaluated. Re-run \`bun run ${
            result.command.replace(/^bun run /, "",)
          }\` on an idle host to check it.`,
        );
      }
      skipped++;
    } else if (result.passed) {
      console.log(`PASS: ${result.name}`,);
      passed++;
    } else if (result.advisory) {
      // Advisory gates run and report but do not fail the run. Print as
      // ADVISORY so the signal is visible without blocking finalization.
      console.log(`ADVISORY: ${result.name}${result.timedOut ? " (timed out, killed)" : ""}`,);
      const outputLines = result.output.split("\n",),
        head = outputLines.slice(0, 5,),
        tail = outputLines.slice(-20,);
      console.log(
        `  Output: ${[...new Set([...head, ...(outputLines.length > 25 ? ["...",] : []), ...tail,],),].join("\n  ",)}`,
      );
      const slug = result.name.replace(/[^a-z0-9]+/gi, "-",).replace(/^-|-$/g, "",).toLowerCase();
      const logPath = path.join(RUN_TMP_DIR, `check-fail-${slug}.log`,);
      try {
        mkdirSync(RUN_TMP_DIR, { recursive: true, },);
        writeFileSync(logPath, result.output,);
        console.log(`  Full output: ${logPath}`,);
      } catch (error) {
        console.log(
          `  Full output unavailable (${String(error,)}). Re-run \`bun run ${
            result.command.replace(/^bun run /, "",)
          }\` directly.`,
        );
      }
      advisory++;
    } else {
      // A timeout is a distinct failure mode from "the gate ran and said no":
      // the gate never got to render a verdict, so say so on the summary line.
      console.log(`FAIL: ${result.name}${result.timedOut ? " (timed out, killed)" : ""}`,);
      // Head for context, tail for the actual failure (see clipOutput).
      const outputLines = result.output.split("\n",),
        head = outputLines.slice(0, 5,),
        tail = outputLines.slice(-20,);
      console.log(
        `  Output: ${[...new Set([...head, ...(outputLines.length > 25 ? ["...",] : []), ...tail,],),].join("\n  ",)}`,
      );
      // The excerpt above drops the middle of the output, which for a long
      // gate run is exactly where the failing assertion lives. Persist the
      // untruncated output so a red gate stays diagnosable without a re-run.
      const slug = result.name.replace(/[^a-z0-9]+/gi, "-",).replace(/^-|-$/g, "",).toLowerCase();
      const logPath = path.join(RUN_TMP_DIR, `check-fail-${slug}.log`,);
      try {
        mkdirSync(RUN_TMP_DIR, { recursive: true, },);
        writeFileSync(logPath, result.output,);
        console.log(`  Full output: ${logPath}`,);
      } catch (error) {
        console.log(
          `  Full output unavailable (${String(error,)}). Re-run \`bun run ${
            result.command.replace(/^bun run /, "",)
          }\` directly.`,
        );
      }
      failed++;
    }
  }

  console.log("\n=== Summary ===",);
  console.log(`Total: ${results.length}`,);
  console.log(`Passed: ${passed}`,);
  console.log(`Skipped: ${skipped}`,);
  console.log(`Advisory: ${advisory}`,);
  console.log(`Failed: ${failed}`,);

  return failed;
}

// ── Machine-readable report ─────────────────────────────────────

/**
 * Build the machine-readable report. Success → summary + per-check status;
 * failure → same plus the full output of every failed check (capped).
 */
export function buildReport({ exitCode, checks, nonBlocking, gpgPrecheck, },) {
  const passedCount = checks.filter((check,) => check.passed).length;
  const skippedCount = checks.filter((check,) => check.skipped).length;
  const advisoryCount = checks.filter((check,) => check.advisory === true && !check.passed && !check.skipped).length;
  const failedCount = checks.length - passedCount - skippedCount - advisoryCount;
  const durationMs = checks.reduce((sum, check,) => sum + (check.durationMs ?? 0), 0,);

  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    runner: "bun run scripts/check-parallel.mjs",
    cwd: PROJECT_ROOT,
    // Provenance: which tree/worktree/invocation produced this snapshot.
    // Consumers compare gitHead against the worktree's current HEAD to detect
    // staleness; runId disambiguates concurrent runs.
    runId: RUN_ID,
    mode: MODE,
    worktreeName: path.basename(PROJECT_ROOT,),
    branch: GIT_CONTEXT.branch,
    gitHead: GIT_CONTEXT.gitHead,
    gitDirty: GIT_CONTEXT.gitDirty,
    // Cache state at run start. `cold` + exitCode !== 0 means the runner
    // refused to start — re-run after `bun run scripts/gpg-unlock.mjs`.
    gpgPrecheck: gpgPrecheck ?? null,
    passed: failedCount === 0,
    exitCode,
    reportPath: REPORT_RELATIVE,
    summary: {
      total: checks.length,
      passed: passedCount,
      skipped: skippedCount,
      advisory: advisoryCount,
      failed: failedCount,
      durationMs,
    },
    checks: checks.map((check,) => ({
      command: check.command,
      passed: check.passed,
      skipped: check.skipped === true,
      advisory: check.advisory === true,
      // True when the gate blew its budget and was killed; the failure output
      // names the gate and the budget (see runCheck).
      timedOut: check.timedOut === true,
      exitCode: check.exitCode,
      durationMs: check.durationMs ?? 0,
      output: check.passed ? null : clipOutput(check.output ?? "", MAX_OUTPUT_CHARS,),
      truncated: check.passed ? false : (check.output ?? "").length > MAX_OUTPUT_CHARS,
    })),
    nonBlocking,
  };
}

export function writeReport(report,) {
  mkdirSync(path.resolve(PROJECT_ROOT, REPORT_DIR_RELATIVE,), { recursive: true, },);

  // 1. Per-run file: full run-specific path. Survives concurrent runs because
  //    each RUN_ID is unique. Atomic write via temp + rename (no torn writes).
  const perRunTmp = `${PER_RUN_REPORT_PATH}.tmp`;
  const json = JSON.stringify(report, null, 2,) + "\n";
  writeFileSync(perRunTmp, json, "utf8",);
  renameSync(perRunTmp, PER_RUN_REPORT_PATH,);

  // 2. Canonical (latest) report: atomic rename from the per-run file. Last
  //    complete run wins. Concurrent readers see either the previous run's
  //    content or the new run's content — never torn. We then re-emit the
  //    per-run file so by-RUN_ID lookups still resolve.
  renameSync(PER_RUN_REPORT_PATH, REPORT_PATH,);
  writeFileSync(PER_RUN_REPORT_PATH, json, "utf8",);

  // 3. `.latest` symlink: a stable filename pointing at this run's per-run
  //    path. Atomic swap via temp + rename so consumers never see a dangling
  //    symlink mid-rotation.
  const latestTmp = `${REPORT_LATEST_PATH}.tmp`;
  try {
    unlinkSync(latestTmp,);
  } catch { /* expected if file doesn't exist */ }
  symlinkSync(`check-report-${RUN_ID}.json`, latestTmp,);
  renameSync(latestTmp, REPORT_LATEST_PATH,);
  // 4. Retention: prune oldest per-run files beyond REPORT_RETENTION_COUNT.
  //    The canonical `check-report.json` and `.latest.json` symlink are never
  //    touched — only `check-report-<RUN_ID>.json` files are GC'd. Same
  //    retention policy is applied to per-tool scratch dirs (`.tmp/run-*/`)
  //    so coverage/jscpd outputs from old runs don't accumulate.
  pruneOldReports();
  pruneOldRunTmpDirs();

  // 5. Stdout contract (Ticket 1):
  //    - Human-readable line with emoji for live terminals (existing behavior).
  //    - Machine-greppable lines, one per fact, no prefix noise. Downstream
  //    agents `grep ^CHECK_REPORT_` to extract facts without parsing the
  //    rest of the report. The `=` form is safe to feed to `cat` / `jq`.
  //    - Per-tool scratch paths are emitted only when the tool actually
  //    ran and produced output (CHECK_REPORT_COVERAGE_LCOV / _JSCPD).
  console.log(`\nCheck report: ${REPORT_PATH}`,);
  console.log(`CHECK_REPORT_PATH=${REPORT_PATH}`,);
  console.log(`CHECK_REPORT_LATEST=${REPORT_LATEST_PATH}`,);
  console.log(`CHECK_REPORT_RUN_ID=${RUN_ID}`,);
  if (existsSync(COVERAGE_LCOV,)) {
    console.log(`CHECK_REPORT_COVERAGE_LCOV=${COVERAGE_LCOV}`,);
  }
  if (existsSync(JSCPD_REPORT,)) {
    console.log(`CHECK_REPORT_JSCPD=${JSCPD_REPORT}`,);
  }
  return REPORT_PATH;
}
