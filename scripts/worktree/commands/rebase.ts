// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { type WorktreeConfig, } from "../utils/config";
import { getRootBranch, gitSync, } from "../utils/git";
import { findWorktreeForBranchSync, getWorktrees, } from "../utils/git";
import { log, } from "../utils/output";

const PROTECTED_BRANCHES = ["master", "main", "stg", "dev",];

function isProtected(branch: string,): boolean {
  return PROTECTED_BRANCHES.includes(branch,);
}

async function findWorktree(branch: string, config: WorktreeConfig,): Promise<string | null> {
  const dirName = branchToPath(branch,);
  const localPath = resolve(config.treeDir, dirName,);
  if (existsSync(resolve(localPath, ".git",),)) { return localPath; }
  // Fallback: omp sibling container (`<repoParent>/<repo>-worktrees/<branch>-<hash>`).
  const worktrees = await getWorktrees(config.repoRoot,);
  return findWorktreeForBranchSync(worktrees, branch,);
}

export async function rebase(
  args: string[],
  config: WorktreeConfig,
): Promise<void> {
  const [branch, onto,] = args;
  const target = onto || getRootBranch(config.repoRoot,);

  if (!branch) {
    log("error", "branch name required",);
    console.log("  Usage: worktree rebase <branch> [onto]",);
    process.exit(1,);
  }

  if (isProtected(branch,)) {
    log("error", `cannot rebase protected branch '${branch}'`,);
    process.exit(1,);
  }

  const wtPath = await findWorktree(branch, config,);
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
