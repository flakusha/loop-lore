// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { existsSync, mkdirSync, symlinkSync, } from "fs";
import { resolve, } from "path";
import { branchToPath, } from "../utils/config";
import { gitSync, isProtected, } from "../utils/git";
import { log, } from "../utils/output";

export async function execute(
  args: string[],
  config: Awaited<ReturnType<typeof import("../index").loadConfig>>,
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

  // Resolve current HEAD — works in both attached and detached states
  const headRef = gitSync(config.repoRoot, "rev-parse", "HEAD",).trim();

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

  log("info", `Creating new branch '${branch}' from '${base}' (HEAD=${headRef.slice(0, 7,)})`,);

  // Use HEAD commit directly as base — works regardless of whether repo root
  // is on a branch or in detached HEAD state.
  const result = Bun.spawnSync(
    ["git", "-C", config.repoRoot, "worktree", "add", "-b", branch, wtPath, headRef,],
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

  log("success", `Created: ${wtPath}`,);
}
