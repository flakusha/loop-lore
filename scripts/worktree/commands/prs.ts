// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { existsSync, mkdirSync, } from "fs";
import { resolve, } from "path";
import { branchToPath, } from "../utils/config";
import type { WorktreeConfig, } from "../utils/config";
import { findWorktreeForBranch, } from "../utils/git";
import { linkNodeModules, } from "../utils/modules";
import { log, } from "../utils/output";

interface GhPr {
  headRefName: string;
  title: string;
  number: number;
}

export async function execute(
  _args: string[],
  config: WorktreeConfig,
): Promise<void> {
  // Check gh is installed
  const which = Bun.spawnSync(["which", "gh",], { stdout: "pipe", stderr: "pipe", },);
  if (which.exitCode !== 0) {
    log("error", "GitHub CLI (gh) not installed — https://cli.github.com/",);
    process.exit(1,);
  }

  // Check gh is authenticated
  const auth = Bun.spawnSync(
    ["gh", "auth", "status",],
    { stdout: "pipe", stderr: "pipe", },
  );
  if (auth.exitCode !== 0) {
    log("error", "GitHub CLI not authenticated — run: gh auth login",);
    process.exit(1,);
  }

  log("info", "Fetching open PRs...",);

  const result = Bun.spawnSync(
    ["gh", "pr", "list", "--json", "headRefName,title,number", "--limit", "100",],
    { stdout: "pipe", stderr: "pipe", },
  );
  if (result.exitCode !== 0) {
    log("error", "failed to fetch PRs",);
    console.error(result.stderr.toString(),);
    process.exit(1,);
  }

  const prs: GhPr[] = JSON.parse(result.stdout.toString(),);
  if (prs.length === 0) {
    log("info", "No open PRs found",);
    return;
  }

  console.log(`  Found ${prs.length} open PR(s)`,);
  console.log();
  // config.treeDir already honors TREE_DIR / OMP_WORKTREE_DIR / EXTRA_TREE_DIRS
  // / canonical fallback. Reading env vars here would re-derive the chain and
  // miss extras when neither TREE_DIR nor OMP are set.
  const dirPath = config.treeDir;
  mkdirSync(dirPath, { recursive: true, },);
  let created = 0;
  let skipped = 0;

  for (const pr of prs) {
    const dirName = branchToPath(pr.headRefName,);
    const wtPath = resolve(dirPath, dirName,);

    // Skip when this branch is already checked out anywhere (in-repo `tree/`
    // or omp's sibling container) — git is the source of truth.
    const existing = await findWorktreeForBranch(config.repoRoot, pr.headRefName,);
    if (existing ?? existsSync(wtPath,)) {
      log("warn", `Skipped: ${pr.headRefName} (already exists at ${existing ?? wtPath})`,);
      skipped++;
      continue;
    }
    log("info", `Creating worktree for PR #${pr.number}: ${pr.title}`,);

    const addResult = Bun.spawnSync(
      ["git", "-C", config.repoRoot, "worktree", "add", wtPath, `origin/${pr.headRefName}`,],
      { stdout: "pipe", stderr: "pipe", },
    );
    if (addResult.exitCode === 0) {
      log("success", `Created: ${wtPath}`,);

      linkNodeModules(config.repoRoot, wtPath,);

      created++;
    } else {
      log("error", `Failed: ${pr.headRefName} (branch not found on remote)`,);
    }
  }

  log("success", `Done: ${created} created, ${skipped} skipped`,);
}
