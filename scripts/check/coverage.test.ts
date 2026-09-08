// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, test, } from "bun:test";
import { spawnSync, } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, resolve, } from "node:path";

const SCRIPT_PATH = resolve(import.meta.dir, "coverage.mjs",);
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true, },);
  }
},);

function runCoverage(lcov: string,): { status: number | null; stdout: string; stderr: string } {
  const root = mkdtempSync(join(tmpdir(), "coverage-script-",),);
  tempDirs.push(root,);
  const coverageDir = join(root, ".tmp", "coverage",);
  mkdirSync(coverageDir, { recursive: true, },);
  writeFileSync(join(coverageDir, "lcov.info",), lcov,);
  const result = spawnSync("bun", [SCRIPT_PATH, "--floor=80",], {
    cwd: root,
    encoding: "utf8",
  },);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, };
}

describe("coverage.mjs", () => {
  test("skips top-level src files from the module table", () => {
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
    expect(report.modules.map((row: { mod: string },) => row.mod,),).toEqual(["server",],);
  },);
},);
