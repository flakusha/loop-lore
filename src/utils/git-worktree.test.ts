// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test } from "bun:test";
import { findMainRepoRoot } from "./git-worktree.ts";
import { mkdirSync, rmSync, } from "node:fs";
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
});