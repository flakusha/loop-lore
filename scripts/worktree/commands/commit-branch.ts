// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Commit-branch command — GPG-signed commit from a worktree branch
 */
import { existsSync, } from "fs";
import { resolve, } from "path";
import { branchToPath, type WorktreeConfig, } from "../utils/config";
import { credentials, } from "../utils/credentials.mjs";
import { gitSyncQuiet, stagedDependencyPaths, } from "../utils/git";
import { assertGpgUnlocked, } from "../utils/gpg";
import { appendCommitOutcome, } from "../utils/ledger";
import { extractMessageInput, validateMessage, } from "../utils/message";
import { log, } from "../utils/output";

const PROTECTED_BRANCHES = ["master", "main", "stg", "dev",];

function isProtected(branch: string,): boolean {
  return PROTECTED_BRANCHES.includes(branch,);
}

export async function commitBranch(
  args: string[],
  config: WorktreeConfig,
): Promise<void> {
  const { rest, message: messageInput, } = await extractMessageInput(args,);
  const [branch, ...messageParts] = rest;
  const message = messageInput ?? messageParts.join(" ",);

  if (!branch) {
    log("error", "branch required",);
    console.log('  Usage: index.mjs commit-branch <branch> [-F <file>|--message-file <file>] "<message>"',);
    process.exit(1,);
  }

  const validation = validateMessage(message,);
  if (!validation.ok) {
    log("error", `commit message rejected: ${validation.reason}`,);
    console.log('  Example: index.mjs commit-branch <branch> -F - <<< "fix(worktree): handle empty stdin"',);
    process.exit(1,);
  }

  if (isProtected(branch,)) {
    log("error", `cannot commit-branch on protected branch '${branch}'`,);
    process.exit(1,);
  }

  // Find worktree: in-repo `tree/<branch>` first, then git's authoritative
  // listing (catches worktrees created outside `tree/`, e.g. omp's sibling
  // container `<repoParent>/<repo>-worktrees/<branch>-<hash>`).
  const dirName = branchToPath(branch,);
  const localPath = resolve(config.treeDir, dirName,);
  let wtPath: string | null = existsSync(resolve(localPath, ".git",),) ? localPath : null;
  if (!wtPath) {
    const worktrees = await getWorktrees(config.repoRoot,);
    wtPath = findWorktreeForBranchSync(worktrees, branch,);
  }
  if (!wtPath) {
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

  // Guard: dependency directories must never be committed.
  const stagedDepPaths = stagedDependencyPaths(wtPath,);
  if (stagedDepPaths.length > 0) {
    log("error", `refusing to commit dependency directory: ${stagedDepPaths.join(", ",)}`,);
    console.log("  Unstage with: git restore --staged <path>",);
    process.exit(1,);
  }

  // Verify credentials
  if (!credentials.found) {
    log("error", "AGENT_GPG_KEY_ID/NAME/EMAIL not set - check .credentials.env",);
    process.exit(1,);
  }

  // Get author from worktree's local git config
  const authorName = gitSyncQuiet(wtPath, "config", "user.name",);
  const authorEmail = gitSyncQuiet(wtPath, "config", "user.email",);

  if (!authorName || !authorEmail) {
    log("error", "worktree user.name/user.email not configured",);
    console.log(`  Run: bun run scripts/worktree/ sign ${branch}`,);
    process.exit(1,);
  }

  // Verify GPG key is in the keyring AND unlocked. The helper exits 1 on
  // any of three failure modes with an actionable hint to scripts/gpg-unlock.mjs.
  assertGpgUnlocked(credentials.keyId,);

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
    log("success", "Commit created:",);
    // Extract short hash from the first line
    const firstLine = output.split("\n",)[0];
    console.log(`  ${firstLine}`,);
  } else {
    log("warn", "Commit created but signature verification unclear",);
    console.log(output,);
  }
  // Outcome dispatch: the generic auto-append in index.ts recorded the
  // invocation; this records what landed (short SHA + subject).
  const commitSha = gitSyncQuiet(wtPath, "rev-parse", "HEAD",);
  appendCommitOutcome(config.treeDir, "commit-branch", branch, commitSha, message,);
}
