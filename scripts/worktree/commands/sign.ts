// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { existsSync, } from "fs";
import { resolve, } from "path";
import { branchToPath, } from "../utils/config";
import { gitSync, } from "../utils/git";
import { log, } from "../utils/output";

export async function execute(
  args: string[],
  config: Awaited<ReturnType<typeof import("../index").loadConfig>>,
): Promise<void> {
  const branch = args[0];
  if (!branch) {
    log("error", "branch name required",);
    console.log("  Usage: worktree sign <branch>",);
    process.exit(1,);
  }

  const dirName = branchToPath(branch,);
  const wtPath = resolve(config.treeDir, dirName,);

  if (!existsSync(resolve(wtPath, ".git",),)) {
    log("error", `no worktree found for branch '${branch}'`,);
    process.exit(1,);
  }

  // Safety: never configure signing on main repo root
  const realWt = resolve(wtPath,);
  const realRoot = resolve(config.repoRoot,);
  if (realWt === realRoot) {
    log("error", "refusing to configure signing on main repo root",);
    process.exit(1,);
  }

  if (!config.agentGpgKeyId) {
    log("warn", "AGENT_GPG_KEY_ID not set — skipping signing config",);
    return;
  }

  // Verify key exists in GPG keyring
  const keyCheck = Bun.spawnSync(
    ["gpg", "--list-keys", config.agentGpgKeyId,],
    { stdout: "pipe", stderr: "pipe", },
  );
  if (keyCheck.exitCode !== 0) {
    log("error", `GPG key ${config.agentGpgKeyId} not found in keyring`,);
    process.exit(1,);
  }

  // Verify secret key exists
  const secretCheck = Bun.spawnSync(
    ["gpg", "--list-secret-keys", config.agentGpgKeyId,],
    { stdout: "pipe", stderr: "pipe", },
  );
  if (secretCheck.exitCode !== 0) {
    log("error", `GPG secret key for ${config.agentGpgKeyId} not found — cannot sign`,);
    process.exit(1,);
  }

  log("info", "Configuring GPG signing for worktree...",);

  gitSync(wtPath, "config", "commit.gpgsign", "true",);
  gitSync(wtPath, "config", "user.signingkey", config.agentGpgKeyId,);

  log("success", `GPG signing enabled (key: ${config.agentGpgKeyId.slice(0, 8,)}...)`,);

  // Configure hooks
  const hooksDir = resolve(config.repoRoot, ".githooks",);
  if (existsSync(hooksDir,)) {
    gitSync(wtPath, "config", "core.hooksPath", hooksDir,);
    log("success", "hooks configured",);
  }
}
