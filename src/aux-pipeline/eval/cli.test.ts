// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * CLI surface of `bun run eval:prompts` (src/aux-pipeline/eval/cli.ts).
 *
 * Only the argv layer is exercised — `--help` and a rejected option. Neither
 * runs the eval corpus, so this never touches `baseline.json`: the mutating
 * `--update-baseline` path is deliberately not spawned here.
 *
 * Failure paths use a spawned child because `runScript` exits the process on
 * a parse error, which cannot be caught in-process. No shared state, no
 * ordering dependence.
 */
import { describe, expect, test, } from "bun:test";
import path from "node:path";

const SCRIPT = path.join(import.meta.dir, "cli.ts",);

describe("eval:prompts CLI", () => {
  test("--help prints the brief and exits 0", () => {
    const proc = Bun.spawnSync(["bun", SCRIPT, "--help",],);
    expect(proc.exitCode,).toBe(0,);
    expect(proc.stdout.toString(),).toContain("Run the prompt-eval fixture corpus",);
  });

  test("an unknown option is rejected with exit 1", () => {
    const proc = Bun.spawnSync(["bun", SCRIPT, "--no-such-flag",],);
    expect(proc.exitCode,).toBe(1,);
  });
});
