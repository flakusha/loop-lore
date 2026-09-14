// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { type WorktreeConfig, } from "../utils/config";
import { gitSync, } from "../utils/git";
import { findWorktreeForBranchSync, getWorktrees, } from "../utils/git";
import { assertAgentGpgUnlocked, } from "../utils/gpg";
import { log, } from "../utils/output";

function gpgMergeFlags(config: WorktreeConfig,): string[] {
  if (!config.agentGpgKeyId) { return []; }
  const gpgCheck = Bun.spawnSync(
    ["gpg", "--list-secret-keys", config.agentGpgKeyId,],
    { stdout: "pipe", stderr: "pipe", },
  );
  if (gpgCheck.exitCode !== 0) { return []; }
  return [
    "-c",
    "commit.gpgsign=true",
    "-c",
    `user.signingkey=${config.agentGpgKeyId}`,
  ];
}

async function findWorktree(branch: string, config: WorktreeConfig,): Promise<string | null> {
  const dirName = branchToPath(branch,);
  const localPath = resolve(config.treeDir, dirName,);
  if (existsSync(resolve(localPath, ".git",),)) { return localPath; }
  // Fallback: worktree lives outside `tree/` (omp sibling container). Git's
  // worktree list is the source of truth for the branch→path mapping.
  const worktrees = await getWorktrees(config.repoRoot,);
  return findWorktreeForBranchSync(worktrees, branch,);
}

export async function merge(
  args: string[],
  config: WorktreeConfig,
): Promise<void> {
  const [branch, source,] = args;

  if (!branch || !source) {
    log("error", "branch and source required",);
    console.log("  Usage: worktree merge <branch> <source>",);
    process.exit(1,);
  }

  const wtPath = await findWorktree(branch, config,);
  if (!wtPath) {
    log("error", `no worktree found for branch '${branch}'`,);
    process.exit(1,);
  }

  // Verify source branch exists
  try {
    gitSync(config.repoRoot, "rev-parse", "--verify", source,);
  } catch {
    log("error", `source branch '${source}' does not exist`,);
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
  // Verify GPG is configured AND unlocked — exits 1 on cold cache.
  // This is the gate that previously let merge.ts silently produce an
  // unsigned merge when gpgMergeFlags() returned [] on cold cache.
  assertAgentGpgUnlocked();

  const flags = gpgMergeFlags(config,);
  log("info", `Merging '${source}' into '${branch}'...`,);

  const result = Bun.spawnSync(
    ["git", "-C", wtPath, ...flags, "merge", source, "--no-edit",],
    { stdout: "pipe", stderr: "pipe", },
  );

  if (result.exitCode !== 0) {
    log("error", `merge failed — resolve conflicts in ${wtPath}`,);
    console.error(result.stderr.toString(),);
    process.exit(1,);
  }

  log("success", `Merged '${source}' into '${branch}'`,);
}
