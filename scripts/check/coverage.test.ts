// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// RESOURCE CONTRACT — what each call owns:
// - DISK: one `mkdtempSync(join(tmpdir(), "coverage-script-"))` (or
//   "coverage-dir-") root per call, holding `.tmp/coverage/lcov.info`.
//   mkdtemp's random suffix is atomic, so concurrent calls — in this process
//   or another `bun test` process — cannot collide on a path. `afterEach`
//   drains `tempDirs`, so even a failing test cannot leak a fixture.
// - READ-ONLY on the repo: coverage.mjs only reads the lcov file named by
//   `--coverage-dir` (defaulting to `.tmp/coverage` UNDER the fixture cwd) and
//   writes nothing. No test points it at a real repo path.
// - No ports, no globals, no ordering dependence; `tempDirs` is the only
//   module-level state and it is drained after every test.

import { afterEach, describe, expect, test, } from "bun:test";
import { spawnSync, } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, resolve, } from "node:path";

const SCRIPT_PATH = resolve(import.meta.dir, "coverage.mjs",);
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0,)) {
    rmSync(dir, { recursive: true, force: true, },);
  }
},);

function runCoverage(
  lcov: string,
  args: string[] = ["--floor=80",],
): { status: number | null; stdout: string; stderr: string } {
  const root = mkdtempSync(join(tmpdir(), "coverage-script-",),);
  tempDirs.push(root,);
  const coverageDir = join(root, ".tmp", "coverage",);
  mkdirSync(coverageDir, { recursive: true, },);
  writeFileSync(join(coverageDir, "lcov.info",), lcov,);
  const result = spawnSync("bun", [SCRIPT_PATH, ...args,], {
    cwd: root,
    encoding: "utf8",
  },);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, };
}

// Fixture modules are picked from src/ tree names that carry NO waiver in
// scripts/check/coverage/waivers.mjs, so the GLOBAL --floor is what decides
// pass/fail. Waived modules would silently pass regardless (`server` floors
// at 0, `frontend` at 75, `tests` at 50), which would make a floor assertion
// vacuous — that is exactly how these fixtures were wrong on the first pass.
const HALF = "TN:\nSF:src/chat/thing.ts\nLF:2\nLH:1\nend_of_record\n";
const FULL = "TN:\nSF:src/chat/thing.ts\nLF:2\nLH:2\nend_of_record\n";

describe("coverage.mjs", () => {
  test("groups top-level src files under the (root) module bucket", () => {
    const result = runCoverage(
      "TN:\n" +
        "SF:src/elysia-app.ts\n" +
        "LF:1\n" +
        "LH:0\n" +
        "end_of_record\n" +
        "TN:\n" +
        "SF:src/server/handler.ts\n" +
        "LF:2\n" +
        "LH:2\n" +
        "end_of_record\n",
    );

    expect(result.status,).toBe(0,);
    expect(result.stderr,).not.toContain("elysia-app.ts",);
    const report = JSON.parse(result.stdout,);
    expect(report.modules.map((row: { mod: string },) => row.mod).sort(),).toEqual(["(root)", "server",].sort(),);
  });

  // Argv contract after the Optique migration. These pin the exact shapes
  // scripts/check/parallel/gates.mjs builds: `--floor=80 --coverage-dir=<dir>`,
  // optionally with `--files=` / `--only=`.
  test("no args still floors at 80", () => {
    const result = runCoverage(HALF, [],);
    expect(result.status,).toBe(1,);
    expect(JSON.parse(result.stdout,).floor,).toBe(80,);
  });

  test("--floor raises the bar: 50% fails at 80 and passes at 40", () => {
    expect(runCoverage(HALF, ["--floor=80",],).status,).toBe(1,);
    expect(runCoverage(HALF, ["--floor=40",],).status,).toBe(0,);
  });

  test("--coverage-dir points the run at a specific lcov directory", () => {
    const root = mkdtempSync(join(tmpdir(), "coverage-dir-",),);
    tempDirs.push(root,);
    const dir = join(root, "run-xyz", "coverage",);
    mkdirSync(dir, { recursive: true, },);
    writeFileSync(join(dir, "lcov.info",), FULL,);
    const result = spawnSync("bun", [SCRIPT_PATH, "--floor=80", `--coverage-dir=${dir}`,], {
      cwd: root,
      encoding: "utf8",
    },);
    expect(result.status,).toBe(0,);
  });

  test("--only narrows the floor to the named module", () => {
    // Two un-waived modules: `chat` is below floor, `scripts` is at 100%.
    // Scoping to the healthy one passes even though the other is short.
    const lcov = HALF + "TN:\nSF:src/scripts/tool.ts\nLF:2\nLH:2\nend_of_record\n";
    expect(runCoverage(lcov, ["--floor=80", "--only=scripts",],).status,).toBe(0,);
    expect(runCoverage(lcov, ["--floor=80", "--only=chat",],).status,).toBe(1,);
  });

  test("a non-numeric --floor is a parse error instead of a silent 80", () => {
    // The old `parseInt(v) || 80` defaulted junk to 80 silently.
    expect(runCoverage(FULL, ["--floor=eighty",],).status,).toBe(1,);
  });

  test("an undeclared flag is a parse error", () => {
    expect(runCoverage(FULL, ["--nope",],).status,).toBe(1,);
  });
});
