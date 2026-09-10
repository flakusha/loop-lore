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
  const { defaultSkip = ["coverage - per-module line %",], } = options;
  const args = [
    "run",
    "--no-install",
    RUNNER,
    ...extraArgs,
    ...(defaultSkip.length > 0 ? ["--skip-gates", defaultSkip.join(",",),] : []),
  ];
  const result = spawnSync("bun", args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    env: { ...process.env, CHECK_SKIP_GPG_PRECHECK: "1", CHECK_JOBS: "1", },
    timeout: 120_000,
  },);
  return {
    exit: result.status,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

describe("selective gate filter — --gates (whitelist)", () => {
  test("unknown gate name exits 2 and lists available gates", () => {
    const r = runRunner(["--gates", "bogus-gate-xyz",], { defaultSkip: [], },);
    expect(r.exit,).toBe(2,);
    expect(r.stderr,).toMatch(/error: unknown gate name\(s\): "bogus-gate-xyz"/,);
    expect(r.stderr,).toMatch(/available gates:/,);
    expect(r.stderr,).toMatch(/md - lint/,);
  });

  test("multiple comma-separated names are honored", () => {
    const r = runRunner(["--gates", "md - lint,format - dprint",], { defaultSkip: [], },);
    expect(r.stderr,).toMatch(/gates filter: whitelisted 2 of \d+ gates/,);
  });

  test("gate names with em-dash punctuation are selectable (no CSV-split collision)", () => {
    // Regression: prior version had a gate named with an embedded COMMA,
    // which collided with the CSV separator. The gate name was renamed
    // to use an em-dash so the full name is one CSV element. Verify
    // that the renamed gate is now selectable via --gates.
    const r = runRunner(
      ["--gates", "frontend - banned patterns (ESLint-gap heuristic — advisory)",],
      { defaultSkip: [], },
    );
    expect(r.stderr,).toMatch(/gates filter: whitelisted 1 of \d+ gates/,);
  });
});

describe("selective gate filter — --skip-gates (inverse)", () => {
  test("inverse filter runs every other gate", () => {
    const r = runRunner(["--skip-gates", "coverage - per-module line %",], {
      defaultSkip: [],
    },);
    expect(r.stderr,).toMatch(/gates filter: skipped 1; running 20 of 21 gates/,);
  });

  test("multiple comma-separated skips accepted", () => {
    const r = runRunner(
      ["--skip-gates", "coverage - per-module line %,no - shell - refs,context - weight",],
      { defaultSkip: [], },
    );
    expect(r.stderr,).toMatch(/gates filter: skipped 3; running 18 of 21 gates/,);
  });
});

describe("selective gate filter — mutual exclusion", () => {
  test("combining --gates and --skip-gates exits 2", () => {
    const r = runRunner(
      ["--gates", "md - lint", "--skip-gates", "lint - eslint",],
      { defaultSkip: [], },
    );
    expect(r.exit,).toBe(2,);
    expect(r.stderr,).toMatch(/mutually exclusive/,);
  });

  test("whitespace-only --gates value is treated as no filter", () => {
    // Defensive: user passes --gates "   " or "" — both should disable the
    // filter rather than fail with "left no checks to run" or silently
    // activate an empty whitelist.
    const r = runRunner(
      ["--gates", "   ",],
      { defaultSkip: ["coverage - per-module line %",], },
    );
    expect(r.exit,).toBe(0,);
    expect(r.stderr,).not.toMatch(/gates filter: whitelisted 0/,);
  });
});
