// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { existsSync, } from "fs";
import { openSync, closeSync, writeSync, unlinkSync, readFileSync, } from "node:fs";
import { resolve, } from "path";
import { branchToPath, type WorktreeConfig, } from "../utils/config";
import { getRootBranch, gitSync, gitSyncQuiet, } from "../utils/git";
import { colorize, log, section, } from "../utils/output";


const LOCK_FILENAME = ".worktree-finalize.lock";
// Git-state sentinel files that indicate an unfinished operation on the dev
// checkout. If any of these exist, popping a stash or fast-forwarding onto
// the tree would compound damage — files end up "modified" instead of the
// operation cancelling cleanly. See BUG-finalize-race.
const DEV_IN_PROGRESS_HEADS = ["MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD",] as const;
// Stash label prefix used by `stashDevForMerge` so `restoreDevFromStash` and
// the precheck can recognize the agent's own leftover entries.
const FINALIZE_STASH_PREFIX = "worktree-finalize-";

/**
 * Precheck: refuse to start if the dev checkout is mid-merge / mid-rebase /
 * mid-cherry-pick, has unmerged paths, or has staged-but-uncommitted entries.
 *
 * This is the hard invariant. The lock below is best-effort single-flight;
 * these prechecks catch the cases where the dev tree is in a half-mutated
 * state that no lock acquisition can repair.
 */
function checkDevMergeable(repoRoot: string,): void {
  // 1. Unmerged paths (merge/rebase/cherry-pick left a tree with conflicts)
  const unmerged = gitSyncQuiet(repoRoot, "ls-files", "--unmerged",);
  if (unmerged.length > 0) {
    log("error", "dev checkout has unmerged paths — resolve or abort before finalizing",);
    console.log("  git -C " + repoRoot + " status  (then resolve or git merge/rebase/cherry-pick --abort)");
    process.exit(1,);
  }

  // 2. In-progress state sentinels (MERGE_HEAD / REBASE_HEAD / CHERRY_PICK_HEAD)
  const gitDirRaw = gitSyncQuiet(repoRoot, "rev-parse", "--git-dir",);
  const gitDirAbs = resolve(repoRoot, gitDirRaw.startsWith("/",) ? gitDirRaw.slice(1,) : gitDirRaw,);
  for (const name of DEV_IN_PROGRESS_HEADS) {
    if (existsSync(resolve(gitDirAbs, name,),)) {
      const op = name.replace("_HEAD", "").toLowerCase();
      log("error", `dev checkout is mid-${op} (${name} exists) — abort or resolve before finalizing`,);
      if (op === "merge") { console.log("  git merge --abort  (or commit the merge)"); }
      else if (op === "rebase") { console.log("  git rebase --abort  (or git rebase --continue)"); }
      else { console.log("  git cherry-pick --abort  (or git cherry-pick --continue)"); }
      process.exit(1,);
    }
  }

  // 3. Staged-but-uncommitted entries — these would interfere with the in-place
  // merge the same way untracked dirty files would.
  const staged = gitSyncQuiet(repoRoot, "diff", "--cached", "--name-only",);
  if (staged.length > 0) {
    const stagedFiles = staged.split("\n",).filter((s,) => s.length > 0,);
    log("error", `dev checkout has ${stagedFiles.length} staged-but-uncommitted entries`,);
    console.log("  git -C " + repoRoot + " commit  (or git -C " + repoRoot + " reset)");
    process.exit(1,);
  }

  // 4. Leftover finalize stashes from a prior crashed finalize. Garbage from
  // the user's perspective but harmless if we leave them; warn so the
  // operator can `git stash drop` them.
  const stashList = gitSyncQuiet(repoRoot, "stash", "list",);
  const leftovers = stashList.split("\n",).filter((l,) => l.includes(FINALIZE_STASH_PREFIX,),);
  if (leftovers.length > 0) {
    log("warn", `dev has ${leftovers.length} leftover finalize stash(es) from prior crash — review 'git stash list'`,);
  }
}

/**
 * Acquire an exclusive finalize lock on the dev checkout.
 *
 * Two concurrent `finalize` invocations race on `repoRoot`: each pushes a
 * stash, runs `git merge`, and pops the stash. Without a lock, A and B both
 * mutate the dev checkout's working tree; whichever finishes second pops
 * the other's stash onto a tree that may already be in rebasing/merge/
 * conflict state, leaving files in "modified" instead of cancelling cleanly.
 *
 * Lock primitive: atomic `O_CREAT|O_EXCL` via Node `openSync(path, 'wx')`.
 * The first caller wins; later callers fail fast. The lockfile content is
 * the PID so a stale lock from a crashed prior run can be detected via
 * `kill -0` and reaped automatically.
 *
 * Returns a release function the caller MUST invoke in a finally block.
 */
function acquireFinalizeLock(repoRoot: string,): () => void {
  const lockPath = resolve(repoRoot, LOCK_FILENAME,);
  const myPid = process.pid;

  const tryCreate = (): boolean => {
    try {
      const fd = openSync(lockPath, "wx",);
      writeSync(fd, String(myPid,),);
      closeSync(fd,);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException,).code !== "EEXIST") { throw err; }
      return false;
    }
  };

  const reapStale = (): void => {
    let raw = "";
    try {
      process.kill(ownerPid, 0,);
      // Owner still alive — keep their lock.
    } catch (err) {
      // Only reap on ESRCH (process truly gone). EPERM means we lack
      // permission to signal the owner — typical for non-root agents
      // checking PID 1 (init) — but the process IS alive, so respect
      // its lock. Any other error also means we cannot determine liveness,
      // so fall through to retry the acquire; that fails safely when the
      // owner is actually gone, and loops indefinitely (50 attempts)
      // when the owner is alive.
      if ((err as NodeJS.ErrnoException,).code === "ESRCH") {
        try { unlinkSync(lockPath,); } catch { /* best-effort */ }
        if (!tryCreate()) { /* lost the race — retry below */ }
      }
    }
  };

  for (let attempt = 0; attempt < 50; attempt++) {
    if (tryCreate()) {
      return (): void => {
        try { unlinkSync(lockPath,); } catch { /* best-effort */ }
      };
    }
    reapStale();
    // Brief backoff before retry. 50 × 20ms = 1s ceiling.
    Bun.sleepSync(20,);
  }
  log("error", `could not acquire finalize lock at ${lockPath} — another finalize in progress?`,);
  console.log("  If no other finalize is running, remove the lockfile manually:",);
  console.log(`    rm ${lockPath}`,);
  process.exit(1,);
}

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
function stashDevForMerge(repoRoot: string,): string | null {
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
  const hasUntracked = untracked.stdout.toString().trim().length > 0;
  if (dirty.exitCode === 0 && staged.exitCode === 0 && !hasUntracked) {
    return null;
  }
  // Generate a distinguishable stash label so we can find it again even if
  // the user has unrelated stashes on the stack.
  const stashLabel = `${FINALIZE_STASH_PREFIX}${Date.now().toString(36,)}`;
  const flags = hasUntracked ? ["--include-untracked",] : [];
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

/**
 * Restore the dev checkout from a stash entry created by `stashDevForMerge`,
 * with transactional semantics: if `git stash pop` conflicts with the
 * post-merge tree (the symptom from BUG-finalize-race where files end up
 * "modified" instead of cancelling cleanly), reset dev to the post-merge
 * HEAD so the tree is clean and the stash entry is preserved for manual
 * recovery.
 */
function restoreDevFromStash(
  repoRoot: string,
  stashLabel: string,
  mergeHead: string,
): void {
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
  if (pop.exitCode === 0) {
    log("success", `Restored stash '${stashLabel}'`,);
    return;
  }

  // Pop failed (conflict with post-merge tree). Roll dev back to the
  // post-merge HEAD so the checkout is clean and the stash entry is
  // preserved. Without this, files end up in "modified" state and the
  // user's pre-merge work disappears into the stash entry.
  log("warn", `stash pop conflicted — resetting dev to post-merge HEAD and preserving stash`,);
  console.log("  Stash output:", pop.stderr.toString().trim(),);
  const reset = Bun.spawnSync(
    ["git", "-C", repoRoot, "reset", "--hard", mergeHead,],
    { stdout: "pipe", stderr: "pipe", },
  );
  if (reset.exitCode !== 0) {
    log("error", `failed to reset dev to ${mergeHead} after stash pop failure`,);
    console.log(`  Stderr: ${reset.stderr.toString().trim()}`,);
    console.log(`  Manual recovery:`,);
    console.log(`    cd ${repoRoot}`);
    console.log(`    git reset --hard ${mergeHead}     # discard the merge (or 'git reset --hard HEAD~1' if you want to undo it)`);
    console.log(`    git stash pop ${stashRef}         # then apply your pre-merge work`);
    process.exit(1,);
  }
  log("info", `Dev reset to ${mergeHead.slice(0, 8,)}; stash entry '${stashRef}' preserved`,);
  console.log(`  Your pre-merge work is still on the stash stack as '${stashRef}'.`,);
  console.log(`  When ready: cd ${repoRoot} && git stash pop ${stashRef}`,);
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

  // Refuse concurrent or in-flight dev-checkout operations BEFORE doing
  // anything that mutates `repoRoot`. See BUG-finalize-race: two concurrent
  // finalizes race on stash push/pop around an in-place merge, which can leave
  // files in "modified" instead of cancelling cleanly. The precheck is the
  // hard invariant; the lock is best-effort single-flight.
  checkDevMergeable(config.repoRoot,);
  const releaseFinalizeLock = acquireFinalizeLock(config.repoRoot,);
  try {
    await runFinalize(branch, mergeStrategy, force, config, wtPath, targetBranch,);
  } finally {
    releaseFinalizeLock();
  }
}

async function runFinalize(
  branch: string,
  mergeStrategy: string,
  force: boolean,
  config: WorktreeConfig,
  wtPath: string,
  targetBranch: string,
): Promise<void> {
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
      const devStash = stashDevForMerge(config.repoRoot,);
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
        if (devStash !== null) {
          const mergeHead = gitSyncQuiet(config.repoRoot, "rev-parse", "HEAD",);
          restoreDevFromStash(config.repoRoot, devStash, mergeHead,);
        }
      }
    } else {
      log("info", `Step 5b: Fast-forward merging into ${targetBranch}...`,);
      const devStash = stashDevForMerge(config.repoRoot,);
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
        if (devStash !== null) {
          const mergeHead = gitSyncQuiet(config.repoRoot, "rev-parse", "HEAD",);
          restoreDevFromStash(config.repoRoot, devStash, mergeHead,);
        }
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
    const devStash = stashDevForMerge(config.repoRoot,);
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
      if (devStash !== null) {
        const mergeHead = gitSyncQuiet(config.repoRoot, "rev-parse", "HEAD",);
        restoreDevFromStash(config.repoRoot, devStash, mergeHead,);
      }
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
