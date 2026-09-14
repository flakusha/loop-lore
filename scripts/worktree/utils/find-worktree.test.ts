// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * findWorktreeByBranch resolution contract against a real git repo in a
 * throwaway temp root (skipped when git is unavailable).
 *
 * Resource contract (parallel-safe): every test owns a unique mkdtemp root;
 * branches and worktree paths are derived from that root, nothing is shared,
 * and teardown runs in `finally` so a failure never leaks a temp repo.
 */

import { describe, expect, test, } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { findWorktreeByBranch, } from "./git";

const gitBin = Bun.which("git",);

function git(root: string, ...args: string[]): void {
  const proc = Bun.spawnSync(["git", "-C", root, ...args,], {
    stdout: "pipe",
    stderr: "pipe",
  },);
  if (proc.exitCode !== 0) {
    throw new Error(`git ${args.join(" ",)} failed: ${proc.stderr.toString()}`,);
  }
}

/** Fresh single-commit repo on `dev` — unique per test root. */
function initRepo(root: string,): void {
  Bun.spawnSync(["git", "init", "-q", "-b", "dev", root,], { stdout: "ignore", stderr: "ignore", },);
  git(root, "config", "user.name", "test",);
  git(root, "config", "user.email", "test@test",);
  git(root, "commit", "--allow-empty", "-m", "init",);
}

describe.skipIf(!gitBin,)("findWorktreeByBranch", () => {
  test("resolves an external checkout by branch, ignoring the dir-name suffix", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-lore-findwt-ext-",),);
    try {
      initRepo(root,);
      git(root, "branch", "feat/ext",);
      // omp-style layout: checkout outside tree/, dir = branch + session suffix
      const external = join(root, "external", "feat-ext-a863f47",);
      mkdirSync(join(root, "external",), { recursive: true, },);
      git(root, "worktree", "add", external, "feat/ext",);

      expect(await findWorktreeByBranch(root, join(root, "tree",), "feat/ext",),).toBe(external,);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
    }
  });

  test("prefers the conventional tree/<branch> layout", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-lore-findwt-tree-",),);
    try {
      initRepo(root,);
      git(root, "branch", "feat-x",);
      const conventional = join(root, "tree", "feat-x",);
      mkdirSync(join(root, "tree",), { recursive: true, },);
      git(root, "worktree", "add", conventional, "feat-x",);

      expect(await findWorktreeByBranch(root, join(root, "tree",), "feat-x",),).toBe(conventional,);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
    }
  });

  test("returns null when the branch has no checkout", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-lore-findwt-none-",),);
    try {
      initRepo(root,);
      git(root, "branch", "lonely",);

      expect(await findWorktreeByBranch(root, join(root, "tree",), "lonely",),).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true, },);
    }
  });
},);
