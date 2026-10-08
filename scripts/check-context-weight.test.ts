// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";

/**
 * CLI contract for scripts/check-context-weight.ts.
 *
 * Every case spawns the script: `runScript` exits the process on a parse
 * error, and `--strict` may exit 1, so neither is observable in-process. The
 * script only READS context files, owns no fixture, and asserts on parsed
 * JSON rather than on a snapshot — nothing to collide under `--parallel`.
 */

const SCRIPT = `${import.meta.dir}/check-context-weight.ts`;

function run(...args: string[]) {
  const proc = Bun.spawnSync(["bun", SCRIPT, ...args,], { cwd: import.meta.dir, },);
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

describe("check-context-weight CLI", () => {
  test("no args: prints the analysis table and exits 0", () => {
    const result = run();
    expect(result.exitCode,).toBe(0,);
    expect(result.stdout,).toContain("=== Context Weight Analysis ===",);
    expect(result.stdout,).toContain("TOTAL",);
  });

  test("--json emits the default 8000-token threshold", () => {
    const result = run("--json",);
    expect(result.exitCode,).toBe(0,);
    expect(JSON.parse(result.stdout,).threshold,).toBe(8_000,);
  });

  test("--threshold sets the budget", () => {
    const result = run("--json", "--threshold=12000",);
    expect(result.exitCode,).toBe(0,);
    expect(JSON.parse(result.stdout,).threshold,).toBe(12_000,);
  });

  test("--budget preset sets the budget", () => {
    const result = run("--json", "--budget=balanced",);
    expect(result.exitCode,).toBe(0,);
    expect(JSON.parse(result.stdout,).threshold,).toBe(15_000,);
  });

  test("--threshold wins over --budget", () => {
    const result = run("--json", "--budget=ultra_lean", "--threshold=9000",);
    expect(result.exitCode,).toBe(0,);
    expect(JSON.parse(result.stdout,).threshold,).toBe(9_000,);
  });

  test("non-numeric --threshold is rejected with exit 1", () => {
    const result = run("--threshold=abc",);
    expect(result.exitCode,).toBe(1,);
  });

  test("unknown flag is rejected with exit 1", () => {
    const result = run("--no-such-flag",);
    expect(result.exitCode,).toBe(1,);
    expect(result.stderr,).toContain("--no-such-flag",);
  });
});
