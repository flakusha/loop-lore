// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Agent commit command — GPG-signed commit from worktree
 */

import { existsSync, } from "fs";
import { dirname, resolve, } from "path";
import { fileURLToPath, } from "url";
import { credentials, } from "../utils/credentials.mjs";
import { gitSync, } from "../utils/git";
import { log, } from "../utils/output";

const __filename = fileURLToPath(import.meta.url,);
const __dirname = dirname(__filename,);

const PROTECTED_BRANCHES = ["master", "main", "stg", "dev",];

export function isProtected(branch: string,): boolean {
  return PROTECTED_BRANCHES.includes(branch,);
}

export async function agentCommit(args: string[],): Promise<void> {
  const [branch, ...messageParts] = args;
  const message = messageParts.join(" ",);

  if (!branch || !message) {
    log("error", "branch and message required",);
    console.log('  Usage: index.mjs agent-commit <branch> "<message>"',);
    process.exit(1,);
  }

  if (isProtected(branch,)) {
    log("error", `cannot agent-commit on protected branch '${branch}'`,);
    process.exit(1,);
  }

  // Find repo root and worktree path
  const repoRoot = resolve(__dirname, "..", "..", "..",);
  const wtPath = resolve(repoRoot, "tree", branch,);

  if (!existsSync(resolve(wtPath, ".git",),)) {
    log("error", `worktree not found for branch '${branch}'`,);
    process.exit(1,);
  }

  // Check staged changes — git diff --quiet exits 1 when differences exist
  const diffResult = Bun.spawnSync(
    ["git", "-C", wtPath, "diff", "--cached", "--quiet",],
    { stdout: "pipe", stderr: "pipe", },
  );
  if (diffResult.exitCode === 0) {
    // Exit 0 = no staged changes
    log("error", `no staged changes in worktree '${branch}'`,);
    console.log(`  Stage files first: cd ${wtPath} && git add <files>`,);
    process.exit(1,);
  }

  // Verify credentials
  if (!credentials.found) {
    log("error", "AGENT_GPG_KEY_ID/NAME/EMAIL not set — check .credentials.env",);
    process.exit(1,);
  }

  // Get author from worktree's local git config
  const authorName = gitSync(wtPath, "config", "user.name",);
  const authorEmail = gitSync(wtPath, "config", "user.email",);

  if (!authorName || !authorEmail) {
    log("error", "worktree user.name/user.email not configured",);
    console.log(`  Run: ./scripts/worktree.sh sign ${branch}`,);
    process.exit(1,);
  }

  // Verify GPG key available
  const gpgCheck = Bun.spawnSync(
    ["gpg", "--list-secret-keys", credentials.keyId,],
    { stdout: "pipe", stderr: "pipe", },
  );
  if (gpgCheck.exitCode !== 0) {
    log("error", `GPG secret key ${credentials.keyId} not found — run: ./scripts/gpg-unlock.sh`,);
    process.exit(1,);
  }

  log("info", `Creating GPG-signed commit in '${branch}'...`,);
  console.log(`  Author:    ${authorName} <${authorEmail}>`,);
  console.log(`  Committer: ${credentials.name} <${credentials.email}>`,);
  console.log(`  GPG Key:   ${credentials.keyId.slice(0, 8,)}...`,);
  console.log(`  Message:   ${message.split("\n",)[0]}`,);

  // Execute commit
  const result = Bun.spawnSync(
    [
      "git",
      "-C",
      wtPath,
      "-c",
      `user.signingkey=${credentials.keyId}`,
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
        GIT_COMMITTER_NAME: credentials.name,
        GIT_COMMITTER_EMAIL: credentials.email,
      },
    },
  );

  if (result.exitCode !== 0) {
    log("error", `commit failed (exit ${result.exitCode})`,);
    console.error(result.stderr.toString(),);
    process.exit(1,);
  }

  // Verify signature
  const verify = Bun.spawnSync(
    ["git", "-C", wtPath, "log", "--show-signature", "-1",],
    { stdout: "pipe", stderr: "pipe", },
  );
  const output = verify.stdout.toString();

  if (output.includes("Good signature",)) {
    console.log(`\n✓ Commit created:`,);
    // Extract short hash from the first line
    const firstLine = output.split("\n",)[0];
    console.log(`  ${firstLine}`,);
  } else {
    console.log(`\n⚠ Commit created but signature verification unclear`,);
    console.log(output,);
  }
}
