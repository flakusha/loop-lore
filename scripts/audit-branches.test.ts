// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";

/**
 * CLI contract for scripts/audit-branches.ts.
 *
 * Every case spawns the script: `runScript` exits the process on a parse
 * error, and `--strict` exits 1 on any REVIEW verdict, so neither is observable
 * in-process. The script only READS the git database and worktree status, owns
 * no fixture and writes nothing — safe under `bun test --parallel`. The cwd is
 * the repo root because the script shells out to `git` with no explicit dir.
 */

const SCRIPT = `${import.meta.dir}/audit-branches.ts`;
const ROOT = `${import.meta.dir}/..`;

function run(...args: string[]) {
  const proc = Bun.spawnSync(["bun", SCRIPT, ...args,], { cwd: ROOT, },);
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

describe("audit-branches CLI", () => {
  test("no args: prints the report and exits 0", () => {
    const result = run();
    expect(result.exitCode,).toBe(0,);
    expect(result.stdout,).toContain("Branches vs dev",);
    expect(result.stdout.length,).toBeGreaterThan(0,);
  });

  test("--json emits a report array with verdicts", () => {
    const result = run("--json",);
    expect(result.exitCode,).toBe(0,);
    const reports = JSON.parse(result.stdout,) as {
      name: string;
      verdict: string;
      ahead: number;
      novel: number;
    }[];
    expect(Array.isArray(reports,),).toBe(true,);
    expect(reports.length,).toBeGreaterThan(0,);
    for (const r of reports) {
      expect(["MERGED", "PATCH-EQ", "REVIEW",],).toContain(r.verdict,);
      expect(typeof r.name,).toBe("string",);
      expect(typeof r.ahead,).toBe("number",);
      expect(typeof r.novel,).toBe("number",);
    }
  });

  test("--base accepts an alternative base ref", () => {
    const result = run("--base", "master",);
    expect(result.exitCode,).toBe(0,);
    expect(result.stdout,).toContain("Branches vs master",);
  });

  test("--base rejects a nonexistent ref", () => {
    const result = run("--base", "no-such-ref-xyz",);
    expect(result.exitCode,).toBe(1,);
    expect(result.stderr,).toContain("does not exist",);
  });

  test("--help prints the brief and exits 0", () => {
    const result = run("--help",);
    expect(result.exitCode,).toBe(0,);
    expect(result.stdout,).toContain("Classify local branches",);
  });

  test("unknown flag is rejected with exit 1", () => {
    const result = run("--no-such-flag",);
    expect(result.exitCode,).toBe(1,);
    expect(result.stderr,).toContain("--no-such-flag",);
  });
});
