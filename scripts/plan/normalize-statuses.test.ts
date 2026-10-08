// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * CLI surface of `bun run plan:status:normalize`
 * (scripts/plan/normalize-statuses.ts).
 *
 * Resource contract — why this suite is parallel-safe:
 * - DISK: only the NON-MUTATING `--check` path is ever spawned. The apply
 *   path (no flag) writes `.plan/epics/*.md` and `.plan/tickets/index.json`,
 *   so no test in this suite may invoke it: a concurrent `bun test` process,
 *   or a sibling agent working in this worktree, would race that write.
 *   `--check` reads the tree and writes nothing, so it is safe to run here
 *   even while another process is normalizing.
 * - EXIT: `--check` exits 1 when drift remains and 0 when the tree is already
 *   canonical. Which one is correct depends on repo state this suite must not
 *   pin, so both are accepted — but a crash (anything else) is not.
 * - PROCESS: each case is a spawned child; the script's module-level parser
 *   and accumulators are per-invocation.
 * - No fixed-path fixtures, no shared globals, no ordering dependence.
 */
import { describe, expect, test, } from "bun:test";
import path from "node:path";

const SCRIPT = path.join(import.meta.dir, "normalize-statuses.ts",);

describe("normalize-statuses CLI", () => {
  test("--help prints the brief and exits 0", () => {
    const proc = Bun.spawnSync(["bun", SCRIPT, "--help",],);
    expect(proc.exitCode,).toBe(0,);
    expect(proc.stdout.toString(),).toContain("Normalize .plan status values",);
  });

  test("--check runs in check-only mode and exits 0 or 1", () => {
    const proc = Bun.spawnSync(["bun", SCRIPT, "--check",],);
    const out = proc.stdout.toString();
    // The banner is the observable proof that --check was honored — without
    // it the script would have printed "applying" and WRITTEN the tree.
    expect(out,).toContain("check only",);
    expect(out,).not.toContain("applying",);
    expect([0, 1,],).toContain(proc.exitCode,);
  });

  test("an unknown option is rejected with exit 1", () => {
    const proc = Bun.spawnSync(["bun", SCRIPT, "--no-such-flag",],);
    expect(proc.exitCode,).toBe(1,);
  });
});
