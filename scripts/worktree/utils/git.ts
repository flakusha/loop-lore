// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Git operation utilities for worktree management
 */

import { resolve, } from "node:path";
import { log, } from "./output";

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

/**
 * True when `cwd` lies inside a linked worktree (e.g. tree/<branch>) rather
 * than the main repo root. Detection is git-aware (uses rev-parse) so it works
 * regardless of how the CLI was launched or which checkout's copy is running:
 * in a linked worktree `--show-toplevel` differs from the parent of
 * `--git-common-dir` (the shared .git).
 */
export function isInsideWorktree(cwd: string = process.cwd(),): boolean {
  try {
    const toplevel = gitSync(cwd, "rev-parse", "--show-toplevel",).trim();
    const commonDir = gitSync(cwd, "rev-parse", "--git-common-dir",).trim();
    const mainRoot = resolve(commonDir, "..",);
    return toplevel !== mainRoot;
  } catch {
    return false;
  }
}

/**
 * Fail fast if a worktree-management command is run from inside a linked
 * worktree (tree/*) instead of the repo root.
 */
export function assertNotInWorktree(command: string,): void {
  if (isInsideWorktree()) {
    console.error(`✘ command '${command}' must be run from the repo root, not inside a worktree (tree/*)`,);
    console.log("  cd to the repo root and re-run: bun run scripts/worktree/ " + command,);
    process.exit(1,);
  }
}

/**
 * Run git in repoRoot. Throws on non-zero exit — callers use try/catch for
 * existence checks (rev-parse --verify). Use gitSyncQuiet for reads where a
 * non-zero exit is a legit empty result (e.g. unset git config).
 */
export function gitSync(repoRoot: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", repoRoot, ...args,], { stdout: "pipe", stderr: "pipe", },);
  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString().trim();
    throw new Error(stderr || `git ${args.join(" ",)} failed (exit ${result.exitCode})`,);
  }
  return result.stdout.toString().trim();
}

/** Like gitSync but returns stdout even on non-zero exit (never throws). */
export function gitSyncQuiet(repoRoot: string, ...args: string[]): string {
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
  const dirty = gitSyncQuiet(repoRoot, "status", "--porcelain",);
  return {
    branch,
    ahead,
    behind,
    clean: dirty === "",
  };
}
