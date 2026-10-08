// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";

/**
 * CLI contract for scripts/check-licenses.ts.
 *
 * `runScript` exits the process on a parse error, so every case spawns the
 * script. The gate's own body shells out to scancode/fossa; on a machine
 * without them it prints the skip banner and exits 0, which is the success
 * path asserted here. No test writes to disk.
 */

const SCRIPT = `${import.meta.dir}/check-licenses.ts`;

function run(...args: string[]) {
  const proc = Bun.spawnSync(["bun", SCRIPT, ...args,], { cwd: import.meta.dir, },);
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

describe("check-licenses CLI", () => {
  test("--strict parses (paired with --help so the scancode/fossa scan is skipped)", () => {
    const result = run("--strict", "--help",);
    expect(result.exitCode,).toBe(0,);
    expect(result.stdout,).toContain("GPL/AGPL license violations",);
  });

  test("--help prints the brief and exits 0", () => {
    const result = run("--help",);
    expect(result.exitCode,).toBe(0,);
    expect(result.stdout,).toContain("GPL/AGPL license violations",);
  });

  test("unknown flag is rejected with exit 1", () => {
    const result = run("--no-such-flag",);
    expect(result.exitCode,).toBe(1,);
    expect(result.stderr,).toContain("--no-such-flag",);
  });
});
