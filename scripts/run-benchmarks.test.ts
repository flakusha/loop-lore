// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * CLI surface of `bun run bench` (scripts/run-benchmarks.ts).
 *
 * Only the argv layer is exercised. The two success/failure paths chosen here
 * deliberately never RUN a benchmark: `--help` exits before discovery, and a
 * filter matching nothing exits from `discoverBenches` before spawning. So the
 * suite is fast and has no CPU contention with a sibling `bun test` process.
 *
 * Failure paths use a spawned child because `runScript` exits the process on
 * a parse error, which cannot be caught in-process. No shared state, no
 * ordering dependence.
 */
import { describe, expect, test, } from "bun:test";
import path from "node:path";

const SCRIPT = path.join(import.meta.dir, "run-benchmarks.ts",);

describe("bench CLI", () => {
  test("--help prints the brief and exits 0", () => {
    const proc = Bun.spawnSync(["bun", SCRIPT, "--help",],);
    expect(proc.exitCode,).toBe(0,);
    expect(proc.stdout.toString(),).toContain("Discover and run tests/benchmarks/",);
  });

  test("an unmatched filter positional exits 1 without running anything", () => {
    const proc = Bun.spawnSync(["bun", SCRIPT, "no-such-bench-filter",],);
    expect(proc.exitCode,).toBe(1,);
    expect(proc.stderr.toString(),).toContain("no benchmarks match",);
  });

  test("an unknown option is rejected with exit 1", () => {
    const proc = Bun.spawnSync(["bun", SCRIPT, "--no-such-flag",],);
    expect(proc.exitCode,).toBe(1,);
  });
});
