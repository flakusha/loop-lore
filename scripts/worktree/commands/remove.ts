// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { existsSync, } from "node:fs";
import { resolve, } from "node:path";
import { branchToPath, type WorktreeConfig, } from "../utils/config";
import { gitSync, } from "../utils/git";
import { findWorktreeForBranchSync, getWorktrees, } from "../utils/git";
import { log, } from "../utils/output";

export async function execute(
  args: string[],
  config: WorktreeConfig,
): Promise<void> {
  const branch = args[0];
  if (!branch) {
    log("error", "branch name required",);
    console.log("  Usage: worktree remove <branch>",);
    process.exit(1,);
  }

  const wtPath = await findWorktree(branch, config,);
  if (!wtPath) {
    log("error", `no worktree found for branch '${branch}'`,);
    process.exit(1,);
  }

  // Check for dirty state
  const dirty = Bun.spawnSync(
    ["git", "-C", wtPath, "diff", "--quiet",],
    { stdout: "pipe", stderr: "pipe", },
  );
  const staged = Bun.spawnSync(
    ["git", "-C", wtPath, "diff", "--cached", "--quiet",],
    { stdout: "pipe", stderr: "pipe", },
  );
  if (dirty.exitCode !== 0 || staged.exitCode !== 0) {
    log("error", `worktree has uncommitted changes`,);
    console.log(`  Stash or commit first: cd ${wtPath} && git stash`,);
    process.exit(1,);
  }

  log("info", `Removing worktree: ${wtPath}`,);

  const result = Bun.spawnSync(
    ["git", "-C", config.repoRoot, "worktree", "remove", wtPath,],
    { stdout: "pipe", stderr: "pipe", },
  );
  if (result.exitCode !== 0) {
    log("error", `worktree remove failed (exit ${result.exitCode})`,);
    console.error(result.stderr.toString(),);
    process.exit(1,);
  }

  log("success", "Removed",);
}

async function findWorktree(branch: string, config: WorktreeConfig,): Promise<string | null> {
  const dirName = branchToPath(branch,);
  const localPath = resolve(config.treeDir, dirName,);
  if (existsSync(resolve(localPath, ".git",),)) { return localPath; }
  // Fallback: omp sibling container (`<repoParent>/<repo>-worktrees/<branch>-<hash>`).
  const worktrees = await getWorktrees(config.repoRoot,);
  return findWorktreeForBranchSync(worktrees, branch,);
}
