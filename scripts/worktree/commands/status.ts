// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Status command - show current branch status
 */

import { resolve, } from "path";
import { branchToPath, resolveBranch, } from "../utils/config";
import { getStatus, gitSync, } from "../utils/git";
import { colorize, log, } from "../utils/output";

export async function execute(
  args: string[],
  config: Awaited<ReturnType<typeof import("../index").loadConfig>>,
): Promise<void> {
  const { repoRoot, } = config;

  let branch = "";
  if (args.length > 0) {
    branch = await resolveBranch(repoRoot, args[0],);
    if (!branch) {
      log("error", `branch '${args[0]}' not found`,);
      process.exit(1,);
    }
  } else {
    branch = gitSync(repoRoot, "branch", "--show-current",);
    if (!branch) {
      log("error", "not on a branch",);
      process.exit(1,);
    }
  }

  log("info", `Branch status:`,);
  console.log("",);

  console.log(`  Branch: ${branch}`,);
  const commit = gitSync(repoRoot, "rev-parse", "--short", branch,);
  console.log(`  Commit: ${commit}`,);

  const status = await getStatus(repoRoot, branch,);
  console.log(`  Ahead: ${status.ahead}`,);
  console.log(`  Behind: ${status.behind}`,);

  // Check if in worktree
  const worktreePath = `${config.treeDir}/${branchToPath(branch,)}`;
  const gitDirExists = await Bun.file(resolve(worktreePath, ".git",),).exists();
  if (gitDirExists) {
    console.log(`  Worktree: ${worktreePath}`,);
  }

  const lastCommitMsg = gitSync(repoRoot, "log", "-1", "--pretty=format:%s", branch,);
  console.log(`  Last commit: ${lastCommitMsg}`,);
  console.log("",);
}
