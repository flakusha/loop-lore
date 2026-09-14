// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Status command - show current branch status
 */
import { statSync, } from "node:fs";
import { resolve, } from "path";
import { branchToPath, resolveBranch, } from "../utils/config";
import { findWorktreeForBranch, getStatus, gitSync, } from "../utils/git";
import { log, } from "../utils/output";

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

  // Check if in any known worktree (in-repo `tree/` or omp's sibling). Git's
  // worktree list is the source of truth — branch→path mapping is exact
  // for both layouts, no dir-shape guessing needed.
  let worktreePath: string | null = await findWorktreeForBranch(repoRoot, branch,);
  if (!worktreePath) {
    // Fallback: scan each container for any dir whose `.git` exists
    // (file or dir) — catches detached/empty worktrees not in git's list.
    const dirName = branchToPath(branch,);
    outer: for (const dirPath of config.worktreeDirs) {
      for (const shape of [dirName, `${dirName}-`,]) {
        for await (const entry of new Bun.Glob(`${shape}*`,).scan({ cwd: dirPath, onlyFiles: false, },)) {
          try {
            const st = statSync(resolve(dirPath, entry, ".git",),);
            if (st.isFile() || st.isDirectory()) {
              worktreePath = resolve(dirPath, entry,);
              break outer;
            }
          } catch {
            // missing .git — skip
          }
        }
      }
    }
  }
  if (worktreePath) {
    console.log(`  Worktree: ${worktreePath}`,);
  }
  const lastCommitMsg = gitSync(repoRoot, "log", "-1", "--pretty=format:%s", branch,);
  console.log(`  Last commit: ${lastCommitMsg}`,);
  console.log("",);
}
