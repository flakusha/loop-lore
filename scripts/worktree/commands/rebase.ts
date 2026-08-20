// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { existsSync, } from "fs";
import { resolve, } from "path";
import { branchToPath, type WorktreeConfig, } from "../utils/config";
import { gitSync, } from "../utils/git";
import { log, } from "../utils/output";

const PROTECTED_BRANCHES = ["master", "main", "stg", "dev",];

function isProtected(branch: string,): boolean {
  return PROTECTED_BRANCHES.includes(branch,);
}

function findWorktree(branch: string, config: WorktreeConfig,): string | null {
  const dirName = branchToPath(branch,);
  const wtPath = resolve(config.treeDir, dirName,);
  if (existsSync(resolve(wtPath, ".git",),)) { return wtPath; }
  return null;
}

export async function rebase(
  args: string[],
  config: WorktreeConfig,
): Promise<void> {
  const [branch, onto,] = args;
  const target = onto || gitSync(config.repoRoot, "branch", "--show-current",) || "master";

  if (!branch) {
    log("error", "branch name required",);
    console.log("  Usage: worktree rebase <branch> [onto]",);
    process.exit(1,);
  }

  if (isProtected(branch,)) {
    log("error", `cannot rebase protected branch '${branch}'`,);
    process.exit(1,);
  }

  const wtPath = findWorktree(branch, config,);
  if (!wtPath) {
    log("error", `no worktree found for branch '${branch}'`,);
    process.exit(1,);
  }

  // Verify target branch exists
  try {
    gitSync(config.repoRoot, "rev-parse", "--verify", target,);
  } catch {
    log("error", `target branch '${target}' does not exist`,);
    process.exit(1,);
  }

  // Check worktree clean
  const dirty = Bun.spawnSync(
    ["git", "-C", wtPath, "diff", "--quiet",],
    { stdout: "pipe", stderr: "pipe", },
  );
  const staged = Bun.spawnSync(
    ["git", "-C", wtPath, "diff", "--cached", "--quiet",],
    { stdout: "pipe", stderr: "pipe", },
  );
  if (dirty.exitCode !== 0 || staged.exitCode !== 0) {
    log("error", `uncommitted changes in worktree '${branch}'`,);
    process.exit(1,);
  }

  log("info", `Rebasing '${branch}' onto '${target}'...`,);

  const result = Bun.spawnSync(
    ["git", "-C", wtPath, "rebase", target,],
    { stdout: "pipe", stderr: "pipe", },
  );

  if (result.exitCode !== 0) {
    log("error", `rebase failed — resolve conflicts in ${wtPath}`,);
    console.log(`  Then: cd ${wtPath} && git rebase --continue`,);
    console.log(`  Or:   cd ${wtPath} && git rebase --abort`,);
    process.exit(1,);
  }

  log("success", `Rebased '${branch}' onto '${target}'`,);
}
