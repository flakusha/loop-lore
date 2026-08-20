// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Configuration utilities for worktree management
 */

import { dirname, resolve, } from "path";
import { fileURLToPath, } from "url";
import { gitSync, } from "./git";

const __filename = fileURLToPath(import.meta.url,);
const __dirname = dirname(__filename,);

export interface WorktreeConfig {
  repoRoot: string;
  treeDir: string;
  agentGpgKeyId?: string;
  agentGpgName?: string;
  agentGpgEmail?: string;
}

export async function findCredentials(startDir: string,): Promise<string | null> {
  let dir = startDir;
  while (dir !== "/") {
    const credentialsPath = resolve(dir, ".credentials.env",);
    const exists = await Bun.file(credentialsPath,).exists();
    if (exists) {
      return dir;
    }
    dir = dirname(dir,);
  }
  return null;
}

/** Strip surrounding quotes (shell .env style) — old shell eval stripped them implicitly. */
function unquote(value: string,): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1,);
    }
  }
  return trimmed;
}

export async function loadConfig(): Promise<WorktreeConfig> {
  const repoRoot = process.env.REPO_ROOT ?? resolve(__dirname, "..", "..", "..",);
  const treeDir = process.env.TREE_DIR ?? resolve(repoRoot, "tree",);

  // Load agent credentials from main repo
  const mainRepoRoot = await findCredentials(repoRoot,);
  let agentGpgKeyId: string | undefined;
  let agentGpgName: string | undefined;
  let agentGpgEmail: string | undefined;

  if (mainRepoRoot) {
    const credentialsPath = resolve(mainRepoRoot, ".credentials.env",);
    const content = await Bun.file(credentialsPath,).text();
    for (const line of content.split("\n",)) {
      if (line.startsWith("AGENT_GPG_KEY_ID=",)) {
        agentGpgKeyId = unquote(line.split("=",)[1],);
      } else if (line.startsWith("AGENT_GPG_NAME=",)) {
        agentGpgName = unquote(line.split("=",)[1],);
      } else if (line.startsWith("AGENT_GPG_EMAIL=",)) {
        agentGpgEmail = unquote(line.split("=",)[1],);
      }
    }
  }

  return {
    repoRoot,
    treeDir,
    agentGpgKeyId,
    agentGpgName,
    agentGpgEmail,
  };
}

export function branchToPath(branch: string,): string {
  return branch.replace(/\//g, "-",);
}

export async function resolveBranch(
  repoRoot: string,
  input: string,
): Promise<string> {
  // Check if it's a valid branch
  try {
    gitSync(repoRoot, "rev-parse", "--verify", input,);
    return input;
  } catch {
    // Try as directory name
    const dirName = branchToPath(input,);
    const worktreePath = resolve(repoRoot, "tree", dirName,);
    const gitExists = await Bun.file(resolve(worktreePath, ".git",),).exists();
    if (gitExists) {
      const headRef = gitSync(worktreePath, "symbolic-ref", "--short", "HEAD",);
      if (headRef) { return headRef; }
    }
    return "";
  }
}
