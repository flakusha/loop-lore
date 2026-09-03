// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { existsSync, mkdirSync, symlinkSync, } from "fs";
import { resolve, } from "path";
import { branchToPath, type WorktreeConfig, } from "../utils/config";
import { gitSync, isProtected, } from "../utils/git";
import { log, } from "../utils/output";

export async function execute(
  args: string[],
  config: WorktreeConfig,
): Promise<void> {
  const branch = args[0];
  const base = args[1] ?? "dev";

  if (!branch) {
    log("error", "branch name required",);
    console.log("  Usage: worktree new-branch <branch> [base]",);
    process.exit(1,);
  }

  if (isProtected(branch,)) {
    log("error", `cannot create worktree for protected branch '${branch}'`,);
    process.exit(1,);
  }

  // Check branch doesn't already exist
  try {
    gitSync(config.repoRoot, "rev-parse", "--verify", `refs/heads/${branch}`,);
    log("error", `branch '${branch}' already exists`,);
    process.exit(1,);
  } catch {
    // branch doesn't exist — good
  }

  // Verify base exists (accepts branch name, tag, or commit)
  try {
    gitSync(config.repoRoot, "rev-parse", "--verify", base,);
  } catch {
    log("error", `base '${base}' does not exist`,);
    process.exit(1,);
  }

  const dirName = branchToPath(branch,);
  const wtPath = resolve(config.treeDir, dirName,);

  if (existsSync(wtPath,)) {
    log("warn", `worktree already exists: ${wtPath}`,);
    return;
  }

  mkdirSync(config.treeDir, { recursive: true, },);

  log("info", `Creating new branch '${branch}' from '${base}'`,);

  // Branch off `base` (the caller-supplied ref, or the default `dev`). Using
  // the resolved ref directly works whether `base` is a branch, tag, or commit.
  const result = Bun.spawnSync(
    ["git", "-C", config.repoRoot, "worktree", "add", "-b", branch, wtPath, base,],
    { stdout: "pipe", stderr: "pipe", },
  );
  if (result.exitCode !== 0) {
    log("error", `worktree add failed (exit ${result.exitCode})`,);
    console.error(result.stderr.toString(),);
    process.exit(1,);
  }

  // Configure GPG signing
  if (config.agentGpgKeyId) {
    const gpgCheck = Bun.spawnSync(
      ["gpg", "--list-keys", config.agentGpgKeyId,],
      { stdout: "pipe", stderr: "pipe", },
    );
    if (gpgCheck.exitCode === 0) {
      const secretCheck = Bun.spawnSync(
        ["gpg", "--list-secret-keys", config.agentGpgKeyId,],
        { stdout: "pipe", stderr: "pipe", },
      );
      if (secretCheck.exitCode === 0) {
        gitSync(wtPath, "config", "commit.gpgsign", "true",);
        gitSync(wtPath, "config", "user.signingkey", config.agentGpgKeyId,);
        log("success", `GPG signing enabled (key: ${config.agentGpgKeyId.slice(0, 8,)}...)`,);
      }
    }
  }

  // Configure hooks
  const hooksDir = resolve(config.repoRoot, ".githooks",);
  if (existsSync(hooksDir,)) {
    gitSync(wtPath, "config", "core.hooksPath", hooksDir,);
    log("success", "hooks configured",);
  }

  // Link node_modules
  const mainModules = resolve(config.repoRoot, "node_modules",);
  const wtModules = resolve(wtPath, "node_modules",);
  if (existsSync(mainModules,) && !existsSync(wtModules,)) {
    symlinkSync(mainModules, wtModules,);
    log("success", "node_modules linked",);
  }

  // Link .credentials.env so worktree-local scripts (check-parallel.mjs,
  // gpg-unlock.mjs — both resolve REPO_ROOT = import.meta.dir + "/..") can
  // find agent GPG identity without a parent-walk. Mirrors the node_modules
  // symlink above: same pattern, same idempotency, same skip-if-present.
  const mainCreds = resolve(config.repoRoot, ".credentials.env",);
  const wtCreds = resolve(wtPath, ".credentials.env",);
  if (existsSync(mainCreds,) && !existsSync(wtCreds,)) {
    symlinkSync(mainCreds, wtCreds,);
    log("success", ".credentials.env linked",);
  }

  log("success", `Created: ${wtPath}`,);
}
