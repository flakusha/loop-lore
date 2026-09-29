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
 */

import { describe, expect, test, } from "bun:test";
import { spawnSync, } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { resolve, } from "node:path";

const PROJECT_ROOT = import.meta.dir + "/..";
const RUNNER = resolve(PROJECT_ROOT, "scripts/check-parallel.mjs",);

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
  return {
    exit: result.status,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

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
    expect(r.stderr,).toMatch(/gates filter: skipped 2; running 25 of 27 gates/,);
  },);

  test("multiple comma-separated skips accepted", { timeout: 120_000, }, () => {
    const r = runRunner(
      ["--skip-gates", "coverage - per-module line %,no - shell - refs,context - weight,e2e - browser (baseline)",],
      { defaultSkip: [], },
    );
    expect(r.stderr,).toMatch(/gates filter: skipped 4; running 23 of 27 gates/,);
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
    const shimDir = resolve(PROJECT_ROOT, `.tmp/test-issue-shim-${process.pid}`,);
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
      const report = JSON.parse(
        readFileSync(resolve(PROJECT_ROOT, ".tmp/check-report.json",), "utf8",),
      );
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
