// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/utils/git-worktree.ts
//
// Shared worktree-detection helper. Used by config/load/fs.ts and
// config/templates-loader/discovery.ts to locate the main repo root
// from inside a git worktree. Lives here (rather than config/load/) to
// avoid the circular import:
//   config/load/load.ts → templates-loader → (if we imported fs.ts) → ???

import { existsSync, readFileSync, statSync, } from "node:fs";
import path from "node:path";

/**
 * Detect if cwd is a git worktree and return the main repo root.
 *
 * In a worktree, `.git` is a file containing:
 *   gitdir: /path/to/main/.git/worktrees/<branch>
 *
 * Returns the main repo root (parent of `.git/`) or null if not in a worktree.
 * @param cwd
 */
export function findMainRepoRoot(cwd: string,): string | null {
  const gitPath = path.join(cwd, ".git",);
  if (!existsSync(gitPath,)) { return null; }

  try {
    if (statSync(gitPath,).isDirectory()) { return null; }
  } catch {
    return null;
  }

  const content = readFileSync(gitPath, "utf8",).trim();
  const match = /^gitdir:\s*(.+)$/.exec(content,);
  if (!match) { return null; }

  const gitdir = match[1]!;
  const worktreesDir = path.dirname(gitdir,);
  const gitDir = path.dirname(worktreesDir,);
  const mainRoot = path.dirname(gitDir,);

  const mainGitPath = path.join(mainRoot, ".git",);
  if (existsSync(mainGitPath,)) {
    try {
      if (statSync(mainGitPath,).isDirectory()) { return mainRoot; }
    } catch {
      // fall through
    }
  }
  return null;
}
