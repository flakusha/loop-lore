// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";

/**
 * CLI contract for scripts/audit-runtime-compat.ts.
 *
 * Every case spawns the script: `runScript` exits the process on a parse
 * error and `--strict` exits 1 on any hit, so neither is observable in-process.
 * The script only READS src/, owns no fixture and writes nothing — safe under
 * `bun test --parallel`. The cwd is the repo root because the script resolves
 * `src/` relative to `process.cwd()`.
 */

const SCRIPT = `${import.meta.dir}/audit-runtime-compat.ts`;
const ROOT = `${import.meta.dir}/..`;

function run(...args: string[]) {
  const proc = Bun.spawnSync(["bun", SCRIPT, ...args,], { cwd: ROOT, },);
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

describe("audit-runtime-compat CLI", () => {
  test("no args: prints the report and exits 0", () => {
    const result = run();
    expect(result.exitCode,).toBe(0,);
    expect(result.stdout.length,).toBeGreaterThan(0,);
  });

  test("--json emits a findings array", () => {
    const result = run("--json",);
    expect(result.exitCode,).toBe(0,);
    expect(Array.isArray(JSON.parse(result.stdout,),),).toBe(true,);
  });

  test("--shared narrows findings to shared modules", () => {
    const all = JSON.parse(run("--json",).stdout,) as { shared: boolean }[];
    const shared = JSON.parse(run("--json", "--shared",).stdout,) as { shared: boolean }[];
    expect(shared.every((f,) => f.shared),).toBe(true,);
    expect(shared.length,).toBeLessThanOrEqual(all.length,);
  });

  test("--help prints the brief and exits 0", () => {
    const result = run("--help",);
    expect(result.exitCode,).toBe(0,);
    expect(result.stdout,).toContain("Scan src/ for Bun-specific APIs",);
  });

  test("unknown flag is rejected with exit 1", () => {
    const result = run("--no-such-flag",);
    expect(result.exitCode,).toBe(1,);
    expect(result.stderr,).toContain("--no-such-flag",);
  });
});
