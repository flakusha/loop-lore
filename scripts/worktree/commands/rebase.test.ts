// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Target validation for `worktree rebase`.
 *
 * Reproduces the two guards that were missing:
 *
 *   1. Default-target resolution. The old code derived the default target
 *      from the main checkout's current branch via `getRootBranch`, which
 *      falls back to the literal "master" on a detached HEAD — so a
 *      detached checkout silently rebased the feature onto the wrong base.
 *      Detached must now refuse instead of guessing.
 *   2. Source-only validation. The old code checked `isProtected(branch)`
 *      and nothing else, so `rebase <feature> <feature>` walked the whole
 *      find-worktree / rev-parse path before git refused the self-rebase.
 *
 * Every refusal must land before any ref moves and before the worktree is
 * touched — asserted with `rev-parse` + `status --porcelain` on the feature.
 *
 * Driven through the real CLI entry point in a child process: the command
 * reports refusals with `process.exit(1)`, which an in-process call cannot
 * survive.
 *
 * Resource contract: each test owns a private `mkdtemp` repo (including its
 * own `tree/` worktree dir), torn down in `afterEach`. The fixture's git
 * commands run with an isolated env so an ambient `GIT_*` on the runner
 * cannot redirect them. No ordering dependence; safe to run in parallel.
 */

import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { branchToPath, } from "../utils/config";
import { isolatedGitEnv, } from "../utils/git";

const DISPATCHER = join(import.meta.dirname, "..", "index.mjs",);
const TARGET = "integration";
let repoRoot: string;
let wtPath: string;

function git(args: string[], cwd: string = repoRoot,): string {
  const result = Bun.spawnSync(["git", "-C", cwd, ...args,], {
    stdout: "pipe",
    stderr: "pipe",
    env: isolatedGitEnv(),
  },);
  if (result.exitCode !== 0) { throw new Error(result.stderr.toString().trim(),); }
  return result.stdout.toString().trim();
}

/** Move TARGET ahead of the feature fork so the two genuinely diverge. */
function divergeTarget(): void {
  git(["checkout", "-q", TARGET,],);
  git(["commit", "--allow-empty", "-qm", "target change",],);
  git(["checkout", "-q", "main",],);
}

/** Run `worktree rebase <args>` in the temp repo. */
function runRebase(args: string[],): { code: number; out: string } {
  const result = Bun.spawnSync([process.execPath, DISPATCHER, "rebase", ...args,], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  },);
  return {
    code: result.exitCode,
    out: `${result.stdout.toString()}${result.stderr.toString()}`.trim(),
  };
}

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), "loop-lore-rebase-",),);
  wtPath = join(repoRoot, "tree", branchToPath("feature",),);

  git(["init", "-q", "-b", "main", repoRoot,],);
  git(["config", "user.email", "rebase-test@localhost",],);
  git(["config", "user.name", "rebase test",],);
  git(["config", "commit.gpgsign", "false",],);
  git(["commit", "--allow-empty", "-qm", "base",],);
  git(["branch", TARGET,],);
  git(["checkout", "-qb", "feature",],);
  git(["commit", "--allow-empty", "-qm", "feature commit",],);
  git(["checkout", "-q", "main",],);
  git(["worktree", "add", wtPath, "feature",],);
},);

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true, },);
},);

describe("rebase target validation", () => {
  it("refuses a detached main checkout instead of rebasing onto 'master'", () => {
    divergeTarget();
    const before = git(["rev-parse", "feature",],);
    // Detached HEAD: `git branch --show-current` returns empty, which the old
    // getRootBranch fallback turned into the literal "master".
    git(["checkout", "-q", "--detach", "HEAD",],);

    const { code, out, } = runRebase(["feature",],);

    expect(code,).toBe(1,);
    expect(out,).toContain("detached HEAD state",);
    expect(git(["rev-parse", "feature",],),).toBe(before,);
    expect(git(["status", "--porcelain",], wtPath,),).toBe("",);
  });

  it("refuses a self-rebase without touching the branch", () => {
    divergeTarget();
    const before = git(["rev-parse", "feature",],);

    const { code, out, } = runRebase(["feature", "feature",],);

    expect(code,).toBe(1,);
    expect(out,).toContain("onto itself",);
    expect(git(["rev-parse", "feature",],),).toBe(before,);
    expect(git(["status", "--porcelain",], wtPath,),).toBe("",);
  });

  it("rebases onto the attached checkout's branch when 'onto' is omitted", () => {
    divergeTarget();
    // The default target is the attached branch (`main`). Protected branches
    // are legal TARGETS — only protected SOURCES are refused — so the
    // documented `rebase <branch>` workflow must keep working.

    const { code, out, } = runRebase(["feature",],);

    expect(out,).toContain("Rebased 'feature' onto 'main'",);
    expect(code,).toBe(0,);
    expect(git(["merge-base", "--is-ancestor", "main", "HEAD",], wtPath,),).toBe("",);
    expect(git(["status", "--porcelain",], wtPath,),).toBe("",);
  });

  it("rebases a diverged feature onto an explicit target", () => {
    divergeTarget();
    const before = git(["rev-parse", "feature",],);

    const { code, out, } = runRebase(["feature", TARGET,],);

    expect(out,).toContain(`Rebased 'feature' onto '${TARGET}'`,);
    expect(code,).toBe(0,);
    expect(git(["rev-parse", "feature",],),).not.toBe(before,);
    expect(git(["merge-base", "--is-ancestor", TARGET, "HEAD",], wtPath,),).toBe("",);
    expect(git(["status", "--porcelain",], wtPath,),).toBe("",);
  });
});
