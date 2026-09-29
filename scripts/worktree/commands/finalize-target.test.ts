// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `finalize` merge-target resolution.
 *
 * The defect: the target came from a helper that falls back to the literal
 * "master" when the root checkout is on a detached HEAD. Detached state is
 * transient but real (during a finalize merge dance, or after a `git
 * checkout <sha>`), and the failure mode is worse than a wrong rebase base -
 * finalize would merge the feature branch into a branch the operator never
 * named, and that branch's history is rewritten in place.
 *
 * The fixture deliberately creates BOTH `main` and `master`, so the old
 * fallback had a real branch to land on and the test can observe that the
 * wrong branch was left untouched. Asserting only the exit code would pass
 * against the old code too, because an absent `master` would fail the merge
 * anyway - it would just fail for the wrong reason, on the wrong branch.
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

function runFinalize(args: string[],): { code: number; out: string } {
  const result = Bun.spawnSync([process.execPath, DISPATCHER, "finalize", ...args,], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    // Skip the GPG preflight: this exercises target resolution, not signing.
    env: { ...process.env, CHECK_SKIP_GPG_PRECHECK: "1", },
  },);
  return {
    code: result.exitCode,
    out: `${result.stdout.toString()}${result.stderr.toString()}`.trim(),
  };
}

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), "loop-lore-finalize-target-",),);
  wtPath = join(repoRoot, "tree", branchToPath("feature",),);

  git(["init", "-q", "-b", "main", repoRoot,],);
  git(["config", "user.email", "finalize-test@localhost",],);
  git(["config", "user.name", "finalize test",],);
  git(["config", "commit.gpgsign", "false",],);
  git(["commit", "--allow-empty", "-qm", "base",],);
  // The decoy the old fallback would have merged into.
  git(["branch", "master",],);
  git(["checkout", "-qb", "feature",],);
  git(["commit", "--allow-empty", "-qm", "feature commit",],);
  git(["checkout", "-q", "main",],);
  git(["worktree", "add", wtPath, "feature",],);
},);

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true, },);
},);

describe("finalize merge-target resolution", () => {
  it("refuses a detached root checkout instead of merging into 'master'", () => {
    const masterBefore = git(["rev-parse", "master",],);
    const featureBefore = git(["rev-parse", "feature",],);
    // `git branch --show-current` returns empty here; the old fallback turned
    // that into the literal "master".
    git(["checkout", "-q", "--detach", "HEAD",],);

    const { code, out, } = runFinalize(["feature",],);

    expect(code,).toBe(1,);
    expect(out,).toContain("detached HEAD state",);
    // The decoy branch is untouched - this is what the old code would move.
    expect(git(["rev-parse", "master",],),).toBe(masterBefore,);
    expect(git(["rev-parse", "feature",],),).toBe(featureBefore,);
    expect(git(["status", "--porcelain",], wtPath,),).toBe("",);
  });
});
