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
  const base = args[1] ?? "master";

  if (!branch) {
    log("error", "branch name required",);
    console.log("  Usage: worktree new <branch> [base]",);
    process.exit(1,);
  }

  if (isProtected(branch,)) {
    log("error", `cannot create branch '${branch}' — protected`,);
    process.exit(1,);
  }

  // Check branch doesn't already exist
  try {
    gitSync(config.repoRoot, "rev-parse", "--verify", branch,);
    log("warn", `branch '${branch}' already exists — use 'create' instead`,);
    return;
  } catch {
    // branch doesn't exist — good
  }

  // Verify base exists
  try {
    gitSync(config.repoRoot, "rev-parse", "--verify", base,);
  } catch {
    log("error", `base branch '${base}' does not exist`,);
    process.exit(1,);
  }

  const dirName = branchToPath(branch,);
  const wtPath = resolve(config.treeDir, dirName,);

  if (existsSync(wtPath,)) {
    log("error", `directory already exists: ${wtPath}`,);
    process.exit(1,);
  }

  mkdirSync(config.treeDir, { recursive: true, },);

  log("info", `Creating new branch '${branch}' from '${base}'`,);

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

  log("success", `Created: ${wtPath}`,);
}
