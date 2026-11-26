// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/utils/git-worktree.ts
//
// Shared worktree-detection helper. Used by config/load/fs.ts and
// config/templates-loader/discovery.ts to locate the main repo root
// from inside a git worktree. Lives here (rather than config/load/) to
// avoid the circular import:
//   config/load/load.ts → templates-loader → (if we imported fs.ts) → ???

import fs from "node:fs";
import path from "node:path";
import { getChildLogger, } from "../logger";

/**
 * Resolve a colocated non-git checkout to its own root.
 *
 * jj and pijul keep their metadata in `.jj/` or `.pijul/` directories and have
 * no git `gitdir:` file to parse. Returning `cwd` keeps callers from reading
 * "not a git worktree" as "not a checkout" and silently applying main-only
 * policy. Best-effort: no marker (or an unreadable one) yields null.
 * @param cwd - working directory to inspect
 * @returns cwd when a non-git checkout marker is a directory, else null.
 */
function findNonGitRoot(cwd: string,): string | null {
  for (const marker of [".jj", ".pijul",]) {
    try {
      if (fs.statSync(path.join(cwd, marker,),).isDirectory()) { return cwd; }
    } catch {
      // Missing marker or race — best-effort detection, never throw.
    }
  }

  return null;
}

/**
 * Detect if cwd is a git worktree and return the main repo root.
 *
 * In a worktree, `.git` is a file containing:
 *   gitdir: /path/to/main/.git/worktrees/<branch>
 *
 * Returns the main repo root (parent of `.git/`) or null if not in a worktree.
 * A colocated jj/pijul checkout resolves to its own root instead of null.
 * @param cwd - working directory to inspect
 * @returns main repo root path, or `null` if cwd is not inside a worktree.
 */
export function findMainRepoRoot(cwd: string,): string | null {
  const gitPath = path.join(cwd, ".git",);
  if (!fs.existsSync(gitPath,)) { return findNonGitRoot(cwd,); }

  try {
    if (fs.statSync(gitPath,).isDirectory()) { return findNonGitRoot(cwd,); }
  } catch (error) {
    // Rare race: `.git` removed between existsSync and statSync, or unreadable.
    getChildLogger("utils/git-worktree",)?.debug("findMainRepoRoot: stat on .git failed", { cwd, err: error, },);
    return null;
  }

  const content = fs.readFileSync(gitPath, "utf8",).trim();
  const match = /^gitdir:\s*(.+)$/.exec(content,);
  if (!match) { return null; }

  const gitdir = match[1]!;
  const worktreesDir = path.dirname(gitdir,);
  const gitDir = path.dirname(worktreesDir,);
  const mainRoot = path.dirname(gitDir,);

  const mainGitPath = path.join(mainRoot, ".git",);
  if (fs.existsSync(mainGitPath,)) {
    try {
      if (fs.statSync(mainGitPath,).isDirectory()) { return mainRoot; }
    } catch (error) {
      getChildLogger("utils/git-worktree",)?.debug("findMainRepoRoot: stat on main .git failed, not a worktree", {
        mainRoot,
        err: error,
      },);
      // fall through
    }
  }

  return null;
}
