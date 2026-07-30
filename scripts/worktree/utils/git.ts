// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Git operation utilities for worktree management
 */

export interface GitBranch {
  name: string;
  current: boolean;
  protected: boolean;
}

export interface GitWorktree {
  path: string;
  branch: string;
  HEAD: string;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  clean: boolean;
}

const PROTECTED_BRANCHES = ["master", "main", "stg", "dev",];

export function isProtected(branch: string,): boolean {
  return PROTECTED_BRANCHES.includes(branch,);
}

export function gitSync(repoRoot: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", repoRoot, ...args,], { stdout: "pipe", stderr: "pipe", },);
  return result.stdout.toString().trim();
}

export async function getBranches(repoRoot: string,): Promise<GitBranch[]> {
  const output = gitSync(repoRoot, "branch", "--format=%(refname:short)",);
  const current = gitSync(repoRoot, "branch", "--show-current",);
  return output
    .split("\n",)
    .filter((b,) => b.trim())
    .map((b,) => ({
      name: b.trim().replace(/^\* /, "",),
      current: b.trim() === current,
      protected: isProtected(b.trim(),),
    }));
}

export async function getWorktrees(repoRoot: string,): Promise<GitWorktree[]> {
  const output = gitSync(repoRoot, "worktree", "list", "--porcelain",);
  const worktrees: GitWorktree[] = [];
  let current: GitWorktree | null = null;

  for (const line of output.split("\n",)) {
    const trimmed = line.trim();
    if (!trimmed) { continue; }

    // Porcelain format: first line after blank is "worktree <path>"
    // or bare path on older git versions
    if (trimmed.startsWith("worktree ",)) {
      if (current) { worktrees.push(current,); }
      current = { path: trimmed.slice(9,), branch: "", HEAD: "", };
    } else if (trimmed.startsWith("HEAD ",)) {
      if (current) { current.HEAD = trimmed.slice(5,); }
    } else if (trimmed.startsWith("branch ",)) {
      if (current) { current.branch = trimmed.slice(7,); }
    } else if (!current && !trimmed.startsWith("bare",) && !trimmed.startsWith("detached",)) {
      // Older git: bare path on first line
      current = { path: trimmed, branch: "", HEAD: "", };
    }
  }
  if (current) { worktrees.push(current,); }
  return worktrees;
}

export async function getStatus(
  repoRoot: string,
  branch: string,
): Promise<GitStatus> {
  const aheadStr = gitSync(repoRoot, "rev-list", "--count", `master..${branch}`,);
  const behindStr = gitSync(repoRoot, "rev-list", "--count", `${branch}..master`,);
  const ahead = parseInt(aheadStr || "0", 10,);
  const behind = parseInt(behindStr || "0", 10,);
  const dirty = gitSync(repoRoot, "diff", "--quiet",);
  return {
    branch,
    ahead,
    behind,
    clean: dirty === "",
  };
}
