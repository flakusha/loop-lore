// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression tests: worktree CLI commands must fail GRACEFULLY (validation
 * error, exit 1) — never with `X is not defined` ReferenceErrors from
 * missing imports. `scripts/` is outside every tsconfig, so this class of
 * bug ships green through typecheck gates; these subprocess probes are the
 * automated net for it (see BUG-typecheck-scripts-worktree-
 * referenceerror-class-bugs-ship-gr). Pre-fix outputs recorded on
 * 2026-09-15: `merge` → "branchToPath is not defined", `remove` →
 * "resolve is not defined" — these assertions fail against that code.
 *
 * Resource contract (parallel-safe):
 * - Each test spawns a short-lived `index.mjs <cmd>` subprocess; spawnSync
 *   is synchronous, so processes are fully reaped before the test returns.
 * - Branch names are unique per invocation (`__nonexistent-*` + random
 *   suffix) and guaranteed absent, so every command exits at its
 *   worktree-lookup step — before any git mutation, GPG call, or file write.
 * - No shared files, ports, or global state; tests pass in any order and
 *   alongside concurrently running test files.
 * - cwd is pinned to the MAIN checkout root (via `git rev-parse
 *   --git-common-dir`, resolvable from any linked worktree) because the CLI
 *   rejects layout commands run from inside `tree/*`.
 */
import { describe, expect, test, } from "bun:test";
import path from "node:path";

const CLI = path.resolve(import.meta.dir, "index.mjs",);

function mainRepoRoot(): string {
  // Main checkout root (where `tree/` lives). `--git-common-dir` from a
  // linked worktree resolves to the main `.git`; from the main checkout it
  // is the relative ".git" — resolve against this file's dir either way.
  const gitDir = Bun.spawnSync(
    ["git", "rev-parse", "--git-common-dir",],
    { cwd: import.meta.dir, stdout: "pipe", stderr: "pipe", },
  ).stdout.toString().trim();
  const abs = path.isAbsolute(gitDir,) ? gitDir : path.resolve(import.meta.dir, gitDir,);
  return path.dirname(abs,);
}

const REPO_ROOT = mainRepoRoot();
const REFERENCE_ERROR = /is not defined|Cannot find name/;

function runCli(args: string[],): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync(
    [process.execPath, CLI, ...args,],
    { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe", },
  );
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode ?? -1,
  };
}

/** Graceful-failure contract shared by every probed command. */
function expectGracefulFailure(out: { stdout: string; stderr: string; exitCode: number },): void {
  expect(out.exitCode,).toBe(1,);
  expect(out.stderr + out.stdout,).not.toMatch(REFERENCE_ERROR,);
}

describe("worktree CLI fails gracefully on nonexistent branches", () => {
  const uniq = (): string => `__nonexistent-${Math.random().toString(36,).slice(2, 10,)}`;

  test("merge does not ReferenceError on missing imports", () => {
    const branch = uniq();
    const out = runCli(["merge", branch, `${branch}-source`,],);
    expectGracefulFailure(out,);
    expect(out.stderr + out.stdout,).toContain(`no worktree found for branch '${branch}'`,);
  });

  test("remove does not ReferenceError on missing imports", () => {
    const branch = uniq();
    const out = runCli(["remove", branch,],);
    expectGracefulFailure(out,);
    expect(out.stderr + out.stdout,).toContain(`no worktree found for branch '${branch}'`,);
  });

  test("commit-branch sibling-container fallback does not ReferenceError", () => {
    const branch = uniq();
    const out = runCli(["commit-branch", branch, "fix: probe",],);
    expectGracefulFailure(out,);
    // getWorktrees()+findWorktreeForBranchSync() run before this message.
    expect(out.stderr + out.stdout,).toContain(`worktree not found for branch '${branch}'`,);
  });

  test("report aggregation fallback does not ReferenceError", () => {
    const out = runCli(["report",],);
    expect(out.exitCode,).toBe(0,);
    expect(out.stderr,).not.toMatch(REFERENCE_ERROR,);
  });
});
