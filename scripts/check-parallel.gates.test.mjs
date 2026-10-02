// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Smoke tests for the --gates / --skip-gates selective filter in
 * `scripts/check-parallel.mjs`. Invokes the runner as a subprocess against
 * the current working tree and asserts the exit code + stderr patterns.
 *
 * Scope: behavioral — verifies the CLI surface (gate whitelist + inverse +
 * unknown-name error + mutually-exclusive error) end-to-end. Does NOT
 * re-test the runner's per-check orchestration (covered by manual
 * `bun run check` runs).
 *
 * Implementation note: `bun test` invokes the file under the bun runtime,
 * so spawning `bun run script.mjs --args` from inside that runtime can be
 * parsed as a bundler invocation (error: "Must use --outdir..."). We use
 * `bun run --no-install <abs-path>` instead, which forces the script
 * interpreter path.
 *
 * `defaultSkip` provides a fallback `--skip-gates` for slow gates
 * (coverage) so the runner returns quickly. Tests that exercise the
 * filter itself must set `defaultSkip: []` so the filter assertion sees
 * the full gate count.
 *
 * Resource contract (every spawn here races the operator's own
 * `bun run check` and every other test process in the same worktree):
 * - ALLOCATES: a per-run report `.tmp/check-report-<RUN_ID>.json`, a
 *   `.tmp/run-<RUN_ID>/` scratch dir, and — in the shim test only — a
 *   `.tmp/test-issue-shim-<pid>-<label>/` dir. Every allocation is removed
 *   again by the `afterEach` below (runner artifacts) or the test's own
 *   `finally` (the shim), so a test run never evicts the operator's
 *   reports out of the 20-run retention window.
 * - READS: only its OWN per-run report, resolved from the `RUN_ID` the
 *   runner prints on stdout (`CHECK_REPORT_RUN_ID`).
 * - MUST NOT READ: `.tmp/check-report.json` (canonical) or
 *   `.tmp/check-report.latest.json`. Both are last-writer-wins across every
 *   run in this worktree, so a verdict read from them is really "whoever
 *   finished last" — the assertion then depends on test ORDER, not on
 *   this test's own run.
 */

import { afterEach, describe, expect, test, } from "bun:test";
import { spawnSync, } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { resolve, } from "node:path";

const PROJECT_ROOT = import.meta.dir + "/..";
const RUNNER = resolve(PROJECT_ROOT, "scripts/check-parallel.mjs",);

// Per-run artifacts created by runners spawned in THIS test process. The
// runner's own retention keeps 20 per-run reports / scratch dirs, so a test
// suite that leaves its 8 behind silently evicts the operator's real check
// reports out of that window. Tracked here and removed in afterEach; the
// canonical report and other runs' files are never touched.
const runArtifactsThisProcess = new Set();

/**
 * The `RUN_ID` the runner assigned to its own report, or null when the run
 * exited before `writeReport` (filter validation, mutually-exclusive CLI
 * error) and therefore wrote nothing.
 */
function ownRunId(stdout,) {
  return stdout.match(/^CHECK_REPORT_RUN_ID=(.+)$/m,)?.[1]?.trim() ?? null;
}

/**
 * This run's own per-run report. Deliberately NOT `.tmp/check-report.json`:
 * the canonical path is shared and last-writer-wins across every runner in
 * the worktree, so reading it makes the verdict a function of test order and
 * of any operator run happening concurrently.
 */
function readOwnReport(stdout,) {
  const runId = ownRunId(stdout,);
  if (runId === null) { return null; }
  const reportPath = resolve(PROJECT_ROOT, ".tmp", `check-report-${runId}.json`,);
  runArtifactsThisProcess.add(reportPath,);
  runArtifactsThisProcess.add(resolve(PROJECT_ROOT, ".tmp", `run-${runId}`,),);
  return JSON.parse(readFileSync(reportPath, "utf8",),);
}

/**
 * Gate names the runner reported executing, in the order it printed them
 * (`PASS:` / `FAIL:` / `SKIP:` verdict lines). Used to check that --skip-gates
 * removed exactly the requested gates and nothing else, instead of pinning a
 * hardcoded registry size that rots on the next gate addition.
 */
function executedGateNames(stdout,) {
  return [...stdout.matchAll(/^(?:PASS|FAIL|SKIP): (.+?)(?: \(timed out, killed\))?$/gm,),]
    .map((m,) => m[1]);
}

/**
 * The full gate registry, read from the runner's own unknown-name error. It
 * exits 2 before any gate runs (~100ms), so this is a cheap independent
 * second source for the registry size — cross-checking it against the
 * --skip-gates arithmetic is what stops either number from rotting when the
 * registry grows.
 */
function availableGateNames() {
  const r = runRunner(["--gates", "__gates-test-registry-probe__",], { defaultSkip: [], },);
  const start = r.stderr.indexOf("available gates:\n",);
  if (r.exit !== 2 || start === -1) {
    throw new Error(`expected the registry probe to exit 2 with a gate list, got ${r.exit}`,);
  }
  return r.stderr
    .slice(start + "available gates:\n".length,)
    .split("\n",)
    .filter((line,) => line.startsWith("  ",))
    .map((line,) => line.slice(2,));
}

/**
 * Assert the --skip-gates contract against THREE independent facts instead of
 * a hardcoded gate total (which re-rots on the next registry addition):
 *
 *   1. runner arithmetic  — `skipped N; running R of T` must satisfy
 *      `N == skipNames.length` and `T == R + N` (the line is internally
 *      consistent and the skip count is not a lie about the CSV).
 *   2. reported vs. executed — `R` must equal the number of gate verdict
 *      lines the runner actually printed. A filter that reported running 28
 *      but only executed 27 (or double-ran one) fails here.
 *   3. names, not just counts — the executed set must contain NONE of the
 *      skipped names, and `executed union skipped` must equal the live
 *      registry (from `availableGateNames()`), so a filter that silently
 *      dropped an extra gate, or kept one it claimed to skip, fails even
 *      though the arithmetic still balanced.
 */
function assertSkipFilter(run, skipNames,) {
  const line = run.stderr.match(/gates filter: skipped (\d+); running (\d+) of (\d+) gates/,);
  expect(line, `no gates-filter summary on stderr:\n${run.stderr}`,).not.toBeNull();
  const [, skipped, running, total,] = line.map(Number,);

  // (1) internal arithmetic + the skip count reflects the CSV we passed.
  expect(skipped,).toBe(skipNames.length,);
  expect(total,).toBe(running + skipped,);

  // (2) the runner's claim vs. what it actually executed.
  const executed = executedGateNames(run.stdout,);
  expect(running,).toBe(executed.length,);

  // (3) the names: skipped gates are gone, nothing else vanished.
  for (const name of skipNames) {
    expect(executed, `skipped gate still executed: ${name}`,).not.toContain(name,);
  }
  const registry = availableGateNames();
  expect(total,).toBe(registry.length,);
  expect(new Set([...executed, ...skipNames,],),).toEqual(new Set(registry,),);
}

/**
 * Run the gate runner with the given extra args. `defaultSkip` provides
 * a fallback `--skip-gates` for slow gates (coverage) when no
 * filter-skip is needed; pass `defaultSkip: []` to exercise the
 * filter in isolation.
 */
function runRunner(extraArgs, options = {},) {
  const {
    defaultSkip = ["coverage - per-module line %", "e2e - browser (baseline)",],
    env: envOverrides = {},
    timeout = 120_000,
  } = options;
  const args = [
    "run",
    "--no-install",
    RUNNER,
    "--diff-base",
    "HEAD",
    ...extraArgs,
    ...(defaultSkip.length > 0 ? ["--skip-gates", defaultSkip.join(",",),] : []),
  ];
  const result = spawnSync("bun", args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    env: { ...process.env, ...envOverrides, CHECK_SKIP_GPG_PRECHECK: "1", CHECK_JOBS: "1", },
    timeout,
  },);
  const stdout = result.stdout ?? "",
    // Register whatever this run allocated so afterEach can reap it, whether
    // or not the calling test reads the report.
    runId = ownRunId(stdout,);
  if (runId !== null) {
    runArtifactsThisProcess.add(resolve(PROJECT_ROOT, ".tmp", `check-report-${runId}.json`,),);
    runArtifactsThisProcess.add(resolve(PROJECT_ROOT, ".tmp", `run-${runId}`,),);
  }
  return {
    exit: result.status,
    stderr: result.stderr ?? "",
    stdout,
  };
}

afterEach(() => {
  for (const artifact of runArtifactsThisProcess) {
    rmSync(artifact, { recursive: true, force: true, },);
  }
  runArtifactsThisProcess.clear();
},);

describe("selective gate filter — --gates (whitelist)", () => {
  test("unknown gate name exits 2 and lists available gates", { timeout: 120_000, }, () => {
    const r = runRunner(["--gates", "bogus-gate-xyz",], { defaultSkip: [], },);
    expect(r.exit,).toBe(2,);
    expect(r.stderr,).toMatch(/error: unknown gate name\(s\): "bogus-gate-xyz"/,);
    expect(r.stderr,).toMatch(/available gates:/,);
    expect(r.stderr,).toMatch(/md - lint/,);
  },);

  test("multiple comma-separated names are honored", { timeout: 120_000, }, () => {
    const r = runRunner(["--gates", "md - lint,format - dprint",], { defaultSkip: [], },);
    expect(r.stderr,).toMatch(/gates filter: whitelisted 2 of \d+ gates/,);
  },);

  test("gate names with parentheses are selectable (no CSV-split collision)", { timeout: 120_000, }, () => {
    // Regression: gate names may contain punctuation; the full name must
    // remain one CSV element and stay selectable via --gates.
    const r = runRunner(
      ["--gates", "mermaid - lint (mmdlint)",],
      { defaultSkip: [], },
    );
    expect(r.stderr,).toMatch(/gates filter: whitelisted 1 of \d+ gates/,);
  },);
});

describe("selective gate filter — --skip-gates (inverse)", () => {
  test("inverse filter runs every other gate", { timeout: 120_000, }, () => {
    const r = runRunner(["--skip-gates", "coverage - per-module line %,e2e - browser (baseline)",], {
      defaultSkip: [],
    },);
    assertSkipFilter(
      { stderr: r.stderr, stdout: r.stdout, },
      ["coverage - per-module line %", "e2e - browser (baseline)",],
    );
  },);

  test("multiple comma-separated skips accepted", { timeout: 120_000, }, () => {
    const r = runRunner(
      ["--skip-gates", "coverage - per-module line %,no - shell - refs,context - weight,e2e - browser (baseline)",],
      { defaultSkip: [], },
    );
    assertSkipFilter(
      { stderr: r.stderr, stdout: r.stdout, },
      [
        "coverage - per-module line %",
        "no - shell - refs",
        "context - weight",
        "e2e - browser (baseline)",
      ],
    );
  },);
});

describe("unevaluable gate is never a red gate carrying invented findings", () => {
  test("plan gate stays green and invents no findings when the issue CLI is unreachable", { timeout: 180_000, }, () => {
    // giwt shells out to `git issue ls --all`. That call can fail on a loaded
    // box or when the issue CLI is not resolvable from the gate's environment,
    // and at one point giwt answered that by printing "git issue CLI
    // unavailable" and then listing every issue it could not SEE as an
    // actionable finding (~112 phantoms) before exiting 1 — a red gate full of
    // invented work. The invariant worth pinning is the one that was broken:
    // an unreachable issue CLI must never turn into a failing gate carrying
    // findings nobody can act on.
    //
    // giwt has since degraded gracefully instead: the .plan/-local gates still
    // run and pass, the unreachable issue reconciliation is reported as
    // advisory, and the command exits 0. So the gate now reports PASS rather
    // than SKIP (the runner's GIWT_ISSUE_CLI_UNAVAILABLE branch is retained as
    // the defence if giwt ever reverts). This test deliberately asserts the
    // user-facing property — green run, no FAIL, no phantoms — instead of the
    // specific classification, so it holds either way.
    //
    // The shim injects the fault and records that it fired, so this cannot pass
    // vacuously if giwt ever stops resolving `git issue` through PATH. The PATH
    // override is scoped to this child process through spawn's structured `env`
    // option — never a shell prefix, and never this agent's own shell — so the
    // shim must be found ahead of the real git.
    // Owned by this test only: `pid` alone would collide if a second test in
    // this same bun-test process ever built a shim, so the name carries this
    // test's label too. Reaped in the `finally` below whatever the assertions
    // do (the afterEach only owns runner artifacts, not the shim).
    const shimDir = resolve(PROJECT_ROOT, `.tmp/test-issue-shim-${process.pid}-unreachable-issue-cli`,);
    const shimLog = resolve(shimDir, "fired.log",);
    mkdirSync(shimDir, { recursive: true, },);
    // Resolve the real git before the PATH override so passthrough works on
    // hosts where git does not live at /usr/bin/git.
    const realGit = Bun.which("git",) ?? "/usr/bin/git";
    writeFileSync(
      resolve(shimDir, "git",),
      [
        "#!/usr/bin/env bash",
        `if [ "$1" = "issue" ]; then echo "$*" >> ${JSON.stringify(shimLog,)}; exit 1; fi`,
        `exec ${JSON.stringify(realGit,)} "$@"`,
        "",
      ].join("\n",),
      { mode: 0o755, },
    );
    try {
      const r = runRunner(["--gates", "plan - validate",], {
        defaultSkip: [],
        env: { PATH: `${shimDir}:${process.env.PATH ?? ""}`, },
        timeout: 300_000,
      },);
      // Non-vacuous: the fault was actually injected.
      expect(existsSync(shimLog,),).toBe(true,);
      expect(r.stdout,).not.toMatch(/FAIL: plan - validate/,);
      // The phantom-findings regression: giwt could not read the issue list,
      // so it must not have produced per-issue "findings" to fix.
      expect(r.stdout,).not.toMatch(/git issue CLI unavailable/,);
      expect(r.exit,).toBe(0,);
      // This run's OWN report, keyed by the RUN_ID the runner printed. The
      // canonical `.tmp/check-report.json` is shared and last-writer-wins
      // across every runner in this worktree, so reading it would grade this
      // test on whichever run finished last — the other tests in this file,
      // a concurrent bun-test process, or the operator's own `bun run check`.
      const report = readOwnReport(r.stdout,);
      expect(report,).not.toBeNull();
      expect(report.runId,).toBe(ownRunId(r.stdout,),);
      expect(report.summary.failed,).toBe(0,);
    } finally {
      rmSync(shimDir, { recursive: true, force: true, },);
    }
  },);
});

describe("selective gate filter — mutual exclusion", () => {
  test("combining --gates and --skip-gates exits 2", { timeout: 120_000, }, () => {
    const r = runRunner(
      ["--gates", "md - lint", "--skip-gates", "lint - eslint",],
      { defaultSkip: [], },
    );
    expect(r.exit,).toBe(2,);
    expect(r.stderr,).toMatch(/mutually exclusive/,);
  },);

  test("whitespace-only --gates value is treated as no filter", { timeout: 120_000, }, () => {
    // Defensive: user passes --gates "   " or "" — both should disable the
    // filter rather than fail with "left no checks to run" or silently
    // activate an empty whitelist.
    const r = runRunner(
      ["--gates", "   ",],
      { defaultSkip: ["coverage - per-module line %", "e2e - browser (baseline)",], },
    );
    expect(r.stderr,).not.toMatch(/gates filter: whitelisted 0/,);
    // A no-filter run must also come back green: gates that could not be
    // evaluated report as skipped, never as a failure carrying the findings
    // they invented while unevaluated (see GIWT_ISSUE_CLI_UNAVAILABLE).
    expect(r.exit,).toBe(0,);
  },);
});
