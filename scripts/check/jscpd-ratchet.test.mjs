// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Pins the argv contract of jscpd-ratchet.mjs after the Optique migration.
// `--report` and `--baseline` must still reach the same comparison, and
// `--update` must still lower a baseline.
//
// RESOURCE CONTRACT — what each `runRatchet` call owns:
// - DISK: exactly one `mkdtempSync(join(tmpdir(), "jscpd-ratchet-test-"))`
//   root holding a private `report.json` AND `baseline.json`. mkdtemp creates
//   the suffix atomically, so concurrent calls — in this process or another
//   `bun test` process — cannot collide.
// - THE MUTATION POINT: `--update` writes the baseline file. That file is
//   ALWAYS this call's own temp copy, never `scripts/check/jscpd-baseline.json`
//   (the committed ratchet baseline). So two parallel `--update` tests, or a
//   test racing the real `jscpd ratchet` gate, cannot write the same path.
//   The two bare-spawn tests (`no --report`, `--help`) never reach a write:
//   the missing `--report` exits 2 before any I/O, and `--help` exits during
//   argument parsing.
// - TEARDOWN: `rmSync` in `finally`, so a failing assertion cannot leak the
//   fixture into a sibling test.
// - READ-ONLY on the repo: nothing outside the temp root is written. Verified
//   by md5-comparing scripts/check/jscpd-baseline.json around a full run.
// - Ordering: no module-level mutable state; tests pass alone and in any order.

import { expect, test, } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";

const SCRIPT = join(import.meta.dir, "jscpd-ratchet.mjs",);

/** Report with `count` duplicate records, as jscpd's json reporter emits. */
function report(count,) {
  return JSON.stringify({ duplicates: Array.from({ length: count, },), },);
}

/**
 * Run the ratchet against a throwaway baseline and report.
 *
 * @param clones - duplicate count the report claims.
 * @param baseline - baseline value for this run.
 * @param extra - additional argv, e.g. ["--update"].
 * @returns exit code, both streams, and the baseline file after the run.
 */
function runRatchet(clones, baseline, extra = [],) {
  const dir = mkdtempSync(join(tmpdir(), "jscpd-ratchet-test-",),);
  try {
    const reportPath = join(dir, "report.json",);
    const baselinePath = join(dir, "baseline.json",);
    writeFileSync(reportPath, report(clones,),);
    writeFileSync(baselinePath, `${JSON.stringify({ clones: baseline, }, null, 2,)}\n`,);
    const proc = Bun.spawnSync(
      ["bun", SCRIPT, "--report", reportPath, "--baseline", baselinePath, ...extra,],
      { stdout: "pipe", stderr: "pipe", },
    );
    return {
      code: proc.exitCode,
      out: new TextDecoder().decode(proc.stdout,),
      err: new TextDecoder().decode(proc.stderr,),
      baseline: JSON.parse(readFileSync(baselinePath, "utf8",),),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true, },);
  }
}

test("a clone count at or under the baseline passes", () => {
  const { code, out, } = runRatchet(3, 5,);
  expect(code,).toBe(0,);
  expect(out,).toContain("OK: jscpd ratchet: 3 clones (baseline 5)",);
});

test("a clone count above the baseline fails", () => {
  const { code, err, } = runRatchet(7, 5,);
  expect(code,).toBe(1,);
  expect(err,).toContain("7 clones exceeds baseline 5",);
});

test("--update lowers the baseline to the measured count", () => {
  const { code, out, baseline, } = runRatchet(3, 5, ["--update",],);
  expect(code,).toBe(0,);
  expect(out,).toContain("jscpd baseline lowered: 5 → 3",);
  expect(baseline.clones,).toBe(3,);
});

test("--update still refuses to raise the baseline", () => {
  const { code, err, baseline, } = runRatchet(9, 5, ["--update",],);
  expect(code,).toBe(1,);
  expect(err,).toContain("refusing to update baseline",);
  expect(baseline.clones,).toBe(5,);
});

test("no --report still exits 2 with the usage line", () => {
  const proc = Bun.spawnSync(["bun", SCRIPT,], { stdout: "pipe", stderr: "pipe", },);
  expect(proc.exitCode,).toBe(2,);
  expect(new TextDecoder().decode(proc.stderr,),).toContain("usage: jscpd-ratchet.mjs",);
});

test("--help prints the brief and exits 0", () => {
  const proc = Bun.spawnSync(["bun", SCRIPT, "--help",], { stdout: "pipe", stderr: "pipe", },);
  expect(proc.exitCode,).toBe(0,);
  expect(new TextDecoder().decode(proc.stdout,),).toContain("Fail when the jscpd clone count grows",);
});
