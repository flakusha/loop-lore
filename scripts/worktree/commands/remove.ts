// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { existsSync, } from "fs";
import { resolve, } from "path";
import { branchToPath, } from "../utils/config";
import { gitSync, } from "../utils/git";
import { log, } from "../utils/output";

export async function execute(
  args: string[],
  config: Awaited<ReturnType<typeof import("../index").loadConfig>>,
): Promise<void> {
  const branch = args[0];
  if (!branch) {
    log("error", "branch name required",);
    console.log("  Usage: worktree remove <branch>",);
    process.exit(1,);
  }

  const dirName = branchToPath(branch,);
  const wtPath = resolve(config.treeDir, dirName,);

  if (!existsSync(resolve(wtPath, ".git",),)) {
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
