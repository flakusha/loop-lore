// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { existsSync, } from "fs";
import { resolve, } from "path";
import { branchToPath, type WorktreeConfig, } from "../utils/config";
import { getRootBranch, gitSync, } from "../utils/git";
import { colorize, log, section, } from "../utils/output";

const PROTECTED_BRANCHES = ["master", "main", "stg", "dev",];

function isProtected(branch: string,): boolean {
  return PROTECTED_BRANCHES.includes(branch,);
}

function findWorktree(branch: string, config: WorktreeConfig,): string | null {
  const dirName = branchToPath(branch,);
  const wtPath = resolve(config.treeDir, dirName,);
  if (existsSync(resolve(wtPath, ".git",),)) { return wtPath; }
  return null;
}

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

function branchToSquashMessage(branch: string,): string {
  let type = "chore";
  let subject = branch;

  const match = branch.match(/^(feature|fix|refactor|perf|docs|test|chore)\//,);
  if (match) {
    type = match[1] === "feature" ? "feat" : match[1];
    subject = branch.slice(match[0].length,);
  }

  subject = subject.replace(/-/g, " ",);
  subject = subject.charAt(0,).toUpperCase() + subject.slice(1,);

  return `${type}: ${subject}`;
}


/**
 * Stash dirty working-tree state on `repoRoot` (the dev checkout) before
 * an in-place merge. Returns a label identifying the stash entry, or `null`
 * if the tree was already clean. The caller MUST call `restoreDirtyDev()`
 * with the same label after the merge completes — even on failure — to
 * avoid losing uncommitted work in the dev checkout.
 *
 * Why: `git merge --ff-only` refuses to proceed when the working tree has
 * uncommitted changes that overlap with the merge. This is the most common
 * cause of FF failure in finalize; auto-stashing makes the flow robust
 * against races where another agent or hook mutates dev mid-finalize.
 */
function stashDirtyDev(repoRoot: string,): string | null {
  const dirty = Bun.spawnSync(
    ["git", "-C", repoRoot, "diff", "--quiet", "--ignore-submodules",],
    { stdout: "pipe", stderr: "pipe", },
  );
  const staged = Bun.spawnSync(
    ["git", "-C", repoRoot, "diff", "--cached", "--quiet", "--ignore-submodules",],
    { stdout: "pipe", stderr: "pipe", },
  );
  const untracked = Bun.spawnSync(
    ["git", "-C", repoRoot, "ls-files", "--others", "--exclude-standard",],
    { stdout: "pipe", stderr: "pipe", },
  );
  const hasUntracked = (untracked.stdout.toString().trim().length > 0);
  if (dirty.exitCode === 0 && staged.exitCode === 0 && !hasUntracked) {
    return null;
  }
  // Generate a distinguishable stash label so we can find it again even if
  // the user has unrelated stashes on the stack.
  const stashLabel = `worktree-finalize-${Date.now().toString(36,)}`;
  const flags = hasUntracked ? ["--include-untracked"] : [];
  const stash = Bun.spawnSync(
    ["git", "-C", repoRoot, "stash", "push", ...flags, "-m", stashLabel,],
    { stdout: "pipe", stderr: "pipe", },
  );
  if (stash.exitCode !== 0) {
    log("error", `failed to stash dirty dev checkout: ${stash.stderr.toString().trim()}`,);
    process.exit(1,);
  }
  log("info", `Stashed dirty dev checkout as '${stashLabel}'`,);
  return stashLabel;
}

function restoreDirtyDev(repoRoot: string, stashLabel: string,): void {
  // Find the stash ref by message; we can't rely on `stash@{0}` because
  // other agents may push stashes between our push and pop.
  const list = Bun.spawnSync(
    ["git", "-C", repoRoot, "stash", "list",],
    { stdout: "pipe", stderr: "pipe", },
  );
  const lines = list.stdout.toString().split("\n",);
  const match = lines.find((line,) => line.includes(stashLabel,),);
  if (!match) {
    log("error", `stash '${stashLabel}' not found — restore manually with 'git stash list'`,);
    process.exit(1,);
  }
  const stashRef = match.split(":",)[0].trim();
  const pop = Bun.spawnSync(
    ["git", "-C", repoRoot, "stash", "pop", stashRef,],
    { stdout: "pipe", stderr: "pipe", },
  );
  if (pop.exitCode !== 0) {
    log("error", `failed to restore stash '${stashLabel}': ${pop.stderr.toString().trim()}`,);
    log("error", `manual recovery: git -C ${repoRoot} stash pop ${stashRef}`,);
    process.exit(1,);
  }
  log("success", `Restored stash '${stashLabel}'`,);
}

function runCheck(wtPath: string,): boolean {
  const result = Bun.spawnSync(
    ["bun", "run", "check",],
    { stdout: "pipe", stderr: "pipe", cwd: wtPath, },
  );
  return result.exitCode === 0;
}

function runTests(wtPath: string,): boolean {
  const result = Bun.spawnSync(
    ["bun", "run", "test:unit",],
    { stdout: "pipe", stderr: "pipe", cwd: wtPath, },
  );
  return result.exitCode === 0;
}

export async function finalize(
  args: string[],
  config: WorktreeConfig,
): Promise<void> {
  // finalize is allowed from inside the worktree (e.g. while iterating on it):
  // the explicit branch arg identifies the target worktree, and loadConfig now
  // resolves repoRoot correctly via --git-common-dir regardless of cwd.
  let branch = "";
  let mergeStrategy = "rebase";
  let force = false;

  // Parse args: first positional is branch, rest are flags
  const nonFlagArgs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--merge-strategy") {
      mergeStrategy = args[++i];
    } else if (arg === "--force" || arg === "-f") {
      force = true;
    } else {
      nonFlagArgs.push(arg,);
    }
  }
  branch = nonFlagArgs[0] || "";

  if (!["rebase", "squash", "direct",].includes(mergeStrategy,)) {
    log("error", `unknown merge strategy '${mergeStrategy}' — use rebase, squash, or direct`,);
    process.exit(1,);
  }

  if (!branch) {
    log("error", "branch name required",);
    console.log("  Usage: worktree finalize <branch> [--merge-strategy rebase|squash|direct] [--force]",);
    process.exit(1,);
  }

  // Resolve directory name to branch name
  const dirName = branchToPath(branch,);
  const dirPath = resolve(config.treeDir, dirName,);
  if (existsSync(resolve(dirPath, ".git",),)) {
    const headRef = gitSync(dirPath, "symbolic-ref", "--short", "HEAD",);
    if (headRef && headRef !== branch) {
      log("info", `Resolved '${branch}' → branch '${headRef}'`,);
      branch = headRef;
    }
  }

  if (isProtected(branch,)) {
    log("error", `cannot finalize protected branch '${branch}'`,);
    process.exit(1,);
  }

  const wtPath = findWorktree(branch, config,);
  if (!wtPath) {
    log("error", `no worktree found for branch '${branch}'`,);
    process.exit(1,);
  }

  const targetBranch = getRootBranch(config.repoRoot,);

  section(`Finalizing '${branch}'`,);

  // Step 1: Check worktree clean
  log("info", "Step 1: Checking worktree state...",);
  const dirty = Bun.spawnSync(
    ["git", "-C", wtPath, "diff", "--quiet",],
    { stdout: "pipe", stderr: "pipe", },
  );
  const staged = Bun.spawnSync(
    ["git", "-C", wtPath, "diff", "--cached", "--quiet",],
    { stdout: "pipe", stderr: "pipe", },
  );
  if (dirty.exitCode !== 0 || staged.exitCode !== 0) {
    log("error", "uncommitted changes detected — commit or stash before finalizing",);
    console.log(`  cd ${wtPath} && git add -A && git commit -m 'feat: ...'`,);
    console.log(`  cd ${wtPath} && git stash`,);
    process.exit(1,);
  }
  log("success", "Worktree clean",);

  // Step 2: Run checks
  log("info", "Step 2: Running checks (bun run check)...",);
  if (force) {
    log("warn", "Skipped: --force flag set",);
  } else {
    const hasBunLock = existsSync(resolve(wtPath, "bun.lock",),);
    if (hasBunLock && runCheck(wtPath,)) {
      log("success", "Checks passed",);
    } else if (!hasBunLock) {
      log("warn", "Skipped: no bun.lock found",);
    } else {
      log("error", "Checks failed — fix before finalizing (or use --force)",);
      process.exit(1,);
    }
  }

  // Step 3: Run tests
  log("info", "Step 3: Running tests (bun run test:unit)...",);
  if (force) {
    log("warn", "Skipped: --force flag set",);
  } else {
    const hasBunLock = existsSync(resolve(wtPath, "bun.lock",),);
    if (hasBunLock && runTests(wtPath,)) {
      log("success", "Tests passed",);
    } else if (!hasBunLock) {
      log("warn", "Skipped: no bun.lock found",);
    } else {
      log("error", "Tests failed — fix before finalizing (or use --force)",);
      process.exit(1,);
    }
  }

  // Step 4: Check branch has commits beyond base
  log("info", "Step 4: Checking commits...",);
  const aheadStr = gitSync(wtPath, "rev-list", "--count", `${targetBranch}..HEAD`,);
  const ahead = parseInt(aheadStr || "0", 10,);
  if (ahead === 0) {
    log("warn", `Branch '${branch}' has no commits beyond ${targetBranch} — nothing to merge`,);
    process.exit(0,);
  }
  log("success", `Branch has ${ahead} commit(s) beyond ${targetBranch}`,);

  // Step 5: Merge
  if (mergeStrategy === "rebase" || mergeStrategy === "squash") {
    // 5a: Rebase
    log("info", `Step 5a: Rebasing '${branch}' onto ${targetBranch}...`,);
    const rebaseResult = Bun.spawnSync(
      ["git", "-C", wtPath, "rebase", targetBranch,],
      { stdout: "pipe", stderr: "pipe", },
    );
    if (rebaseResult.exitCode !== 0) {
      log("error", `Rebase conflicts — resolve in ${wtPath}`,);
      console.log(`  Then: cd ${wtPath} && git rebase --continue`,);
      console.log(`  Then: finalize again`,);
      console.log(`  Or:   cd ${wtPath} && git rebase --abort`,);
      process.exit(1,);
    }
    log("success", "Rebased successfully",);

    // 5b: Integrate
    if (mergeStrategy === "squash") {
      const msg = branchToSquashMessage(branch,);
      log("info", `Step 5b: Squash merging into ${targetBranch}...`,);
      const devStash = stashDirtyDev(config.repoRoot,);
      try {
        const mergeResult = Bun.spawnSync(
          ["git", "-C", config.repoRoot, "merge", branch, "--squash", "-m", msg,],
          { stdout: "pipe", stderr: "pipe", },
        );
        if (mergeResult.exitCode !== 0) {
          log("error", "Squash merge failed",);
          process.exit(1,);
        }
        log("success", `Squash merged: ${msg}`,);
      } finally {
        if (devStash !== null) { restoreDirtyDev(config.repoRoot, devStash,); }
      }
    } else {
      log("info", `Step 5b: Fast-forward merging into ${targetBranch}...`,);
      const devStash = stashDirtyDev(config.repoRoot,);
      let ffOk = false;
      try {
        const mergeResult = Bun.spawnSync(
          ["git", "-C", config.repoRoot, "merge", branch, "--ff-only",],
          { stdout: "pipe", stderr: "pipe", },
        );
        if (mergeResult.exitCode !== 0) {
          log("error", "Fast-forward merge failed",);
          process.exit(1,);
        }
        ffOk = true;
        log("success", "Fast-forward merged",);
      } finally {
        if (devStash !== null) { restoreDirtyDev(config.repoRoot, devStash,); }
      }
      if (ffOk) { /* restored above */ }
    }
  } else if (mergeStrategy === "direct") {
    // Direct merge warning
    console.log("",);
    console.log(colorize("╔════════════════════════════════════════════════════════════╗", "yellow",),);
    console.log(colorize("║  ⚠ WARNING: Direct merge strategy                        ║", "yellow",),);
    console.log(colorize("║                                                          ║", "yellow",),);
    console.log(colorize(`║  Conflicts will be resolved on ${targetBranch.padEnd(35,)}║`, "yellow",),);
    console.log(colorize(`║  This can leave ${targetBranch.padEnd(35,)} in a broken state.║`, "yellow",),);
    console.log(colorize("║                                                          ║", "yellow",),);
    console.log(colorize("║  Consider: --merge-strategy rebase                        ║", "yellow",),);
    console.log(colorize("╚════════════════════════════════════════════════════════════╝", "yellow",),);
    console.log("",);

    if (!force) {
      log("error", "Aborted. Use --force to proceed with direct merge",);
      process.exit(1,);
    }

    log("info", `Step 5: Merging '${branch}' into ${targetBranch} (direct)...`,);
    const flags = gpgMergeFlags(config,);
    const devStash = stashDirtyDev(config.repoRoot,);
    try {
      const mergeResult = Bun.spawnSync(
        ["git", "-C", config.repoRoot, ...flags, "merge", branch, "--no-edit",],
        { stdout: "pipe", stderr: "pipe", },
      );
      if (mergeResult.exitCode !== 0) {
        log("error", `Merge conflicts — resolve on ${targetBranch}`,);
        process.exit(1,);
      }
      log("success", `Merged into ${targetBranch}`,);
    } finally {
      if (devStash !== null) { restoreDirtyDev(config.repoRoot, devStash,); }
    }

    // Verify GPG signature
    const mergeSha = gitSync(config.repoRoot, "rev-parse", "HEAD",);
    const verifyResult = Bun.spawnSync(
      ["git", "-C", config.repoRoot, "verify-commit", mergeSha,],
      { stdout: "pipe", stderr: "pipe", },
    );
    if (verifyResult.exitCode === 0) {
      log("success", `Merge commit GPG-signed (${mergeSha.slice(0, 8,)})`,);
    } else {
      log("warn", "Merge commit not signed — GPG key may be locked",);
    }
  }

  // Step 6: Remove worktree
  log("info", "Step 6: Removing worktree...",);
  const removeResult = Bun.spawnSync(
    ["git", "worktree", "remove", wtPath, "--force",],
    { stdout: "pipe", stderr: "pipe", cwd: config.repoRoot, },
  );
  if (removeResult.exitCode === 0) {
    log("success", "Worktree removed",);
  } else {
    log("warn", `Failed to remove worktree — remove manually: git worktree remove ${wtPath}`,);
  }

  // Step 7: Delete branch
  log("info", "Step 7: Deleting branch...",);
  const deleteResult = Bun.spawnSync(
    ["git", "-C", config.repoRoot, "branch", "-d", branch,],
    { stdout: "pipe", stderr: "pipe", },
  );
  if (deleteResult.exitCode === 0) {
    log("success", "Branch deleted",);
  } else {
    // Force delete
    Bun.spawnSync(
      ["git", "-C", config.repoRoot, "branch", "-D", branch,],
      { stdout: "pipe", stderr: "pipe", },
    );
    log("success", "Branch deleted (forced)",);
  }

  console.log("",);
  log("success", `Finalized '${branch}' — merged to ${targetBranch}`,);
}
