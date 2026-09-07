// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Manual recovery command for a finalize that left the dev checkout in a
 * bad state — for example, a `kill -9` (SIGKILL) that bypassed the signal
 * handler, or a crash between the stash push and the merge.
 *
 * What it does, in order:
 *
 *   1. Detect in-progress git operations on the dev checkout (MERGE_HEAD,
 *      REBASE_HEAD, CHERRY_PICK_HEAD) and abort each.
 *   2. Pop any leftover `worktree-finalize-*` stash entries — these are
 *      auto-pushed by `stashDevForMerge` before every merge. Pop conflicts
 *      fall back to `git reset --hard HEAD` so the dev tree is clean.
 *   3. Remove the finalize lockfile if present.
 *   4. Print a recovery report so the user can verify the state.
 *
 * Usage:
 *   bun run scripts/worktree/ abort              # recover the dev checkout
 *   bun run scripts/worktree/ abort --dry-run   # report only, no mutations
 *
 * Design notes:
 * - Idempotent. Running it twice in a row does the same thing.
 * - Never deletes user-authored stashes. We only touch entries whose message
 *   contains `worktree-finalize-`.
 * - Never force-deletes branches, never resets to a remote ref, never
 *   touches the worktree under `tree/`. The user owns those decisions.
 */
import { existsSync, readFileSync, unlinkSync, } from "node:fs";
import { resolve, } from "path";
import { type WorktreeConfig, } from "../utils/config";
import { gitSync, gitSyncQuiet, } from "../utils/git";
import { log, section, } from "../utils/output";

const LOCK_FILENAME = ".worktree-finalize.lock";
const FINALIZE_STASH_PREFIX = "worktree-finalize-";
// Sentinel files git drops into .git/ during in-progress operations. We
// abort each one we find. Order matters: abort merge before pop stash, so
// a stash entry created for a merge doesn't get pulled onto a conflicted
// tree.
const DEV_IN_PROGRESS_HEADS = ["MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD",] as const;

export async function abort(
  _args: string[],
  config: WorktreeConfig,
): Promise<void> {
  section("Finalize abort (manual recovery)",);
  const dryRun = _args.includes("--dry-run",);
  if (dryRun) { log("warn", "DRY RUN: no mutations will be performed",); }
  const repoRoot = config.repoRoot;

  const gitDirRaw = gitSyncQuiet(repoRoot, "rev-parse", "--git-dir",);
  const gitDirAbs = resolve(repoRoot, gitDirRaw.startsWith("/",) ? gitDirRaw.slice(1,) : gitDirRaw,);

  // 1. Abort in-progress operations.
  for (const name of DEV_IN_PROGRESS_HEADS) {
    if (!existsSync(resolve(gitDirAbs, name,),)) { continue; }
    const op = name.replace("_HEAD", "",).toLowerCase();
    log("info", `Found ${name} — aborting in-progress ${op}...`,);
    if (dryRun) { continue; }
    const result = Bun.spawnSync(
      ["git", "-C", repoRoot, op, "--abort",],
      { stdout: "pipe", stderr: "pipe", },
    );
    if (result.exitCode === 0) {
      log("success", `aborted in-progress ${op}`,);
    } else {
      log("warn", `${op} --abort failed — you may need manual intervention`,);
      console.log(`  Stderr: ${result.stderr.toString().trim()}`,);
    }
  }

  // 2. Pop leftover finalize stashes.
  const stashList = gitSync(repoRoot, "stash", "list",);
  const finalizeStashes = stashList.split("\n",).filter((l,) => l.includes(FINALIZE_STASH_PREFIX,));
  if (finalizeStashes.length === 0) {
    log("info", "No leftover finalize stashes",);
  } else {
    log("info", `Found ${finalizeStashes.length} finalize stash(es)`,);
    for (const line of finalizeStashes) {
      const stashRef = line.split(":",)[0].trim();
      log("info", `Restoring ${stashRef}...`,);
      if (dryRun) { continue; }
      const pop = Bun.spawnSync(
        ["git", "-C", repoRoot, "stash", "pop", stashRef,],
        { stdout: "pipe", stderr: "pipe", },
      );
      if (pop.exitCode === 0) {
        log("success", `restored ${stashRef}`,);
        continue;
      }
      // Pop conflicted — fall back to `reset --hard HEAD` and preserve the stash.
      log("warn", `${stashRef} pop conflicted — preserving stash, cleaning tree`,);
      const head = gitSyncQuiet(repoRoot, "rev-parse", "HEAD",);
      const reset = Bun.spawnSync(
        ["git", "-C", repoRoot, "reset", "--hard", head,],
        { stdout: "pipe", stderr: "pipe", },
      );
      if (reset.exitCode !== 0) {
        log("error", `reset --hard HEAD failed`,);
        console.log(`  Stderr: ${reset.stderr.toString().trim()}`,);
      }
    }
  }

  // 3. Remove lockfile if present.
  const lockPath = resolve(repoRoot, LOCK_FILENAME,);
  if (existsSync(lockPath,)) {
    let owner = "<unknown>";
    try {
      owner = readFileSync(lockPath, "utf8",).trim() || owner;
    } catch { /* ignore */ }
    log("info", `Found lockfile at ${lockPath} (owner PID ${owner})`,);
    if (!dryRun) {
      try {
        unlinkSync(lockPath,);
        log("success", "lockfile removed",);
      } catch (err) {
        log("warn", `could not remove lockfile: ${(err as Error).message}`,);
      }
    }
  } else {
    log("info", "No lockfile present",);
  }

  // 4. Final state report.
  console.log("",);
  log("info", "Final dev checkout state:",);
  const head = gitSyncQuiet(repoRoot, "rev-parse", "--short", "HEAD",);
  const branch = gitSyncQuiet(repoRoot, "branch", "--show-current",) || "(detached)";
  console.log(`  HEAD:   ${head}`,);
  console.log(`  Branch: ${branch}`,);
  console.log(`  Status: ${gitSyncQuiet(repoRoot, "status", "--porcelain",) || "(clean)"}`,);

  if (dryRun) {
    console.log("",);
    log("warn", "DRY RUN complete — no mutations performed. Re-run without --dry-run to apply.",);
  } else {
    console.log("",);
    log("success", "Abort complete. Verify state, then re-run finalize if needed.",);
  }
}
