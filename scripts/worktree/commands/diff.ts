// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Diff command - show diff between branch and master
 */

import { resolveBranch, } from "../utils/config";
import { getStatus, gitSync, } from "../utils/git";
import { colorize, log, } from "../utils/output";

export async function execute(
  args: string[],
  config: Awaited<ReturnType<typeof import("../index").loadConfig>>,
): Promise<void> {
  const { repoRoot, } = config;

  if (args.length === 0) {
    log("error", "branch name required",);
    console.log("Usage: worktree diff <branch>",);
    process.exit(1,);
  }

  const branch = await resolveBranch(repoRoot, args[0],);
  if (!branch) {
    log("error", `branch '${args[0]}' not found`,);
    process.exit(1,);
  }

  const status = await getStatus(repoRoot, branch,);

  log("info", `Diff for '${branch}':`,);
  console.log("",);

  if (status.ahead === 0 && status.behind === 0) {
    console.log("  Branch is up to date with master",);
    return;
  }

  if (status.ahead > 0) {
    log("success", `Ahead: ${status.ahead} commits`,);
    console.log("",);
    console.log("  Changed files:",);

    try {
      const files = gitSync(repoRoot, "diff", "--name-only", `master..${branch}`,);
      for (const file of files.split("\n",).filter(f => f)) {
        console.log(`    ${colorize("•", "cyan",)} ${file}`,);
      }
    } catch {
      console.log("    (unable to list files)",);
    }
    console.log("",);
  }

  if (status.behind > 0) {
    log("warn", `Behind: ${status.behind} commits`,);
    console.log("",);
  }
}
