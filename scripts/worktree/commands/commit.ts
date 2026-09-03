// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Commit command — GPG-signed commit on current branch
 */

import { type WorktreeConfig, } from "../utils/config";
import { gitSync, gitSyncQuiet, } from "../utils/git";
import { assertGpgUnlocked, } from "../utils/gpg";
import { extractMessageInput, } from "../utils/message";
import { log, } from "../utils/output";

export async function commit(
  args: string[],
  config: WorktreeConfig,
): Promise<void> {
  const { rest, message: messageInput, } = await extractMessageInput(args,);
  const message = messageInput ?? rest.join(" ",);

  if (!message) {
    log("error", "commit message required",);
    console.log('  Usage: worktree commit [-F <file>|--message-file <file>] "<message>"',);
    console.log('  Multi-line: worktree commit -F .tmp/msg.txt   (or pipe via "-F -")',);
    process.exit(1,);
  }

  // Verify agent credentials
  if (!config.agentGpgKeyId) {
    log("error", "AGENT_GPG_KEY_ID not set in .credentials.env",);
    process.exit(1,);
  }

  if (!config.agentGpgName || !config.agentGpgEmail) {
    log("error", "AGENT_GPG_NAME/AGENT_GPG_EMAIL not set in .credentials.env",);
    process.exit(1,);
  }

  // Check for staged changes
  const staged = Bun.spawnSync(
    ["git", "diff", "--cached", "--quiet",],
    { stdout: "pipe", stderr: "pipe", cwd: config.repoRoot, },
  );
  if (staged.exitCode === 0) {
    log("error", "no staged changes",);
    console.log("  Stage files first: git add <files>",);
    process.exit(1,);
  }

  // Get author from git config
  const authorName = gitSyncQuiet(config.repoRoot, "config", "user.name",);
  const authorEmail = gitSyncQuiet(config.repoRoot, "config", "user.email",);

  if (!authorName || !authorEmail) {
    log("error", "git user.name/user.email not configured",);
    console.log("  Run: git config user.name 'Your Name' && git config user.email 'you@example.com'",);
    process.exit(1,);
  }

  // Verify GPG key is in the keyring AND unlocked. The helper exits 1 on
  // any of three failure modes with an actionable hint to scripts/gpg-unlock.mjs.
  assertGpgUnlocked(config.agentGpgKeyId,);

  const currentBranch = gitSync(config.repoRoot, "branch", "--show-current",) || "(detached)";

  log("info", `Creating GPG-signed commit on '${currentBranch}'...`,);
  console.log(`  Author:    ${authorName} <${authorEmail}>`,);
  console.log(`  Committer: ${config.agentGpgName} <${config.agentGpgEmail}>`,);
  console.log(`  GPG Key:   ${config.agentGpgKeyId.slice(0, 8,)}...`,);
  console.log(`  Message:   ${message.split("\n",)[0]}`,);

  const result = Bun.spawnSync(
    [
      "git",
      "-C",
      config.repoRoot,
      "-c",
      `user.signingkey=${config.agentGpgKeyId}`,
      "-c",
      "commit.gpgsign=true",
      "commit",
      "-S",
      "--no-verify",
      `--author=${authorName} <${authorEmail}>`,
      "-m",
      message,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        GIT_COMMITTER_NAME: config.agentGpgName,
        GIT_COMMITTER_EMAIL: config.agentGpgEmail,
      },
    },
  );

  if (result.exitCode !== 0) {
    log("error", `commit failed (exit ${result.exitCode})`,);
    console.error(result.stderr.toString(),);
    process.exit(1,);
  }

  // Verify signature
  const commitSha = gitSync(config.repoRoot, "rev-parse", "HEAD",);
  const verify = Bun.spawnSync(
    ["git", "-C", config.repoRoot, "verify-commit", commitSha,],
    { stdout: "pipe", stderr: "pipe", },
  );

  if (verify.exitCode === 0) {
    log("success", `Commit created and GPG-signed: ${commitSha}`,);
  } else {
    log("warn", "Commit created but signature verification failed",);
  }
}
