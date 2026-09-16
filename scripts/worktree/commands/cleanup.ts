// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { existsSync, readdirSync, rmSync, } from "fs";
import { resolve, } from "path";
import type { WorktreeConfig, } from "../utils/config";
import { getWorktrees, gitSync, } from "../utils/git";
import { colorize, log, } from "../utils/output";

export async function execute(
  _args: string[],
  config: WorktreeConfig,
): Promise<void> {
  // Iterate every known container: `tree/` (canonical) and `OMP_WORKTREE_DIR`
  // (omp's sibling container). Each is independently skippable when absent.
  const containers = config.worktreeDirs.filter((d,) => existsSync(d,));
  if (containers.length === 0) {
    log("info", "no worktree containers found — nothing to clean",);
    return;
  }

  log("info", "Checking for stale worktrees...",);
  const worktrees = await getWorktrees(config.repoRoot,);
  let removed = 0;

  for (const dirPath of containers) {
    const entries = readdirSync(dirPath, { withFileTypes: true, },);
    for (const entry of entries) {
      if (!entry.isDirectory()) { continue; }
      const wtPath = resolve(dirPath, entry.name,);

      // Find matching worktree entry
      const wt = worktrees.find(w => w.path === wtPath);
      if (!wt || !wt.branch) {
        console.log(`  ${colorize("Skipped (detached HEAD):", "yellow",)} ${wtPath}`,);
        continue;
      }

      const branch = wt.branch.replace("refs/heads/", "",);

      // Check if branch still exists
      try {
        gitSync(config.repoRoot, "rev-parse", "--verify", branch,);
        console.log(`  ${colorize("Kept:", "green",)} ${wtPath} (branch '${branch}' exists)`,);
      } catch {
        console.log(`  ${colorize("Removing stale:", "red",)} ${wtPath} (branch '${branch}' deleted)`,);
        const result = Bun.spawnSync(
          ["git", "-C", config.repoRoot, "worktree", "remove", wtPath,],
          { stdout: "pipe", stderr: "pipe", },
        );
        if (result.exitCode === 0) {
          removed++;
        }
      }
    }

    // Clean up empty directories under this container
    for (const entry of readdirSync(dirPath, { withFileTypes: true, },)) {
      if (!entry.isDirectory()) { continue; }
      const dirSubPath = resolve(dirPath, entry.name,);
      try {
        const remaining = readdirSync(dirSubPath,);
        if (remaining.length === 0) {
          rmSync(dirSubPath, { recursive: true, },);
        }
      } catch {
        // skip
      }
    }
  }

  log("success", `Cleanup complete: ${removed} worktree(s) removed`,);
}
