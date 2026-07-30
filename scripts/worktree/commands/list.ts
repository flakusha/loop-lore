// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * List command — show all worktrees with status
 */

import { dirname, resolve, } from "path";
import { fileURLToPath, } from "url";
import { getStatus, getWorktrees, } from "../utils/git";
import { colorize, colors, log, section, } from "../utils/output";

const __filename = fileURLToPath(import.meta.url,);
const __dirname = dirname(__filename,);

const PROTECTED = ["master", "main", "stg", "dev",];

function isProtectedBranch(branch: string,): boolean {
  return PROTECTED.includes(branch,);
}

export async function listWorktrees(): Promise<void> {
  const repoRoot = resolve(__dirname, "..", "..", "..",);
  const worktrees = await getWorktrees(repoRoot,);

  if (worktrees.length === 0) {
    log("info", "No worktrees found",);
    return;
  }

  section("Worktrees",);

  for (const wt of worktrees) {
    const branch = wt.branch.replace("refs/heads/", "",);
    const isProt = isProtectedBranch(branch,);

    const label = isProt
      ? `${colorize(branch, "gray",)} ${colorize("(protected)", "gray",)}`
      : colorize(branch, "cyan",);

    console.log(`\n  ${label}`,);
    console.log(`    path: ${wt.path}`,);

    try {
      const status = await getStatus(repoRoot, branch,);
      const headShort = wt.HEAD.slice(0, 8,);

      let syncLabel = "";
      if (status.ahead > 0 && status.behind > 0) {
        syncLabel = `${colorize(`ahead ${status.ahead}`, "green",)} ${colorize(`behind ${status.behind}`, "red",)}`;
      } else if (status.ahead > 0) {
        syncLabel = colorize(`ahead ${status.ahead}`, "green",);
      } else if (status.behind > 0) {
        syncLabel = colorize(`behind ${status.behind}`, "red",);
      } else {
        syncLabel = "up to date";
      }

      console.log(`    HEAD: ${headShort} — ${syncLabel}`,);
    } catch {
      console.log(`    HEAD: ${wt.HEAD.slice(0, 8,)}`,);
    }
  }

  console.log();
}
