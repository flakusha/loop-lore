// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test } from "bun:test";
import { findMainRepoRoot } from "./git-worktree.ts";
import { mkdirSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("findMainRepoRoot", () => {
  test("returns null when not in a git directory", () => {
    const cwd = tmpdir();
    expect(findMainRepoRoot(cwd,)).toBeNull();
  });

  test("returns null when .git is a directory (not worktree)", () => {
    const tempDir = join(tmpdir(), `test-git-dir-${Date.now()}-${Math.random()}`);
    mkdirSync(tempDir, { recursive: true });
    const gitDir = join(tempDir, ".git");
    mkdirSync(gitDir);
    try {
      expect(findMainRepoRoot(tempDir,)).toBeNull();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("returns null when .git file has no gitdir: prefix", () => {
    const tempDir = join(tmpdir(), `test-no-gitdir-${Date.now()}-${Math.random()}`);
    mkdirSync(tempDir, { recursive: true });
    const gitFile = join(tempDir, ".git");
    writeFileSync(gitFile, "not a worktree ref\n");
    try {
      expect(findMainRepoRoot(tempDir,)).toBeNull();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("returns null when gitdir path does not lead to a valid main repo .git dir", () => {
    const tempDir = join(tmpdir(), `test-no-main-${Date.now()}-${Math.random()}`);
    mkdirSync(tempDir, { recursive: true });
    // gitdir points to /nonexistent/.git/worktrees/something — no main .git dir exists
    const gitFile = join(tempDir, ".git");
    writeFileSync(gitFile, "gitdir: /nonexistent/.git/worktrees/branch\n");
    try {
      expect(findMainRepoRoot(tempDir,)).toBeNull();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("returns main repo root when .git is a valid worktree file", () => {
    // Simulate: /tmp/<main>/.git is a real dir
    // and /tmp/<main>/.git/worktrees/<wt>/ is the worktree
    const mainDir = join(tmpdir(), `test-main-${Date.now()}-${Math.random()}`);
    const worktreesDir = join(mainDir, ".git", "worktrees");
    const worktreeBranchDir = join(worktreesDir, "feature-test");
    const worktreeDir = join(tmpdir(), `test-wt-${Date.now()}-${Math.random()}`);

    mkdirSync(join(mainDir, ".git"), { recursive: true });
    mkdirSync(worktreeBranchDir, { recursive: true });
    mkdirSync(worktreeDir, { recursive: true });

    const gitFile = join(worktreeDir, ".git");
    writeFileSync(gitFile, `gitdir: ${worktreeBranchDir}\n`);

    try {
      expect(findMainRepoRoot(worktreeDir,)).toBe(mainDir);
    } finally {
      rmSync(mainDir, { recursive: true, force: true });
      rmSync(worktreeDir, { recursive: true, force: true });
    }
  });
});
