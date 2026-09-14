// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Configuration utilities for worktree management
 */

import { existsSync, symlinkSync, } from "fs";
import { dirname, resolve, } from "path";
import { findRepoRoot, gitSync, } from "./git";
import { log, } from "./output";

export interface WorktreeConfig {
  repoRoot: string;
  /**
   * Primary worktree container — canonical in-repo `tree/`, or `TREE_DIR` env
   * override. The shared agent ledger lives here so all worktrees see one
   * `tree/.ledger.jsonl`. Kept for ledger/credential paths; *read* and *create*
   * operations should consult `worktreeDirs` and `git worktree list` instead.
   */
  treeDir: string;
  /**
   * All known worktree container dirs in priority order: `tree/` (canonical),
   * then `OMP_WORKTREE_DIR` (omp's out-of-repo sibling), then any
   * `EXTRA_TREE_DIRS`. New worktrees land in the first writable entry;
   * readers fall back through the list when a branch isn't in the primary.
   */
  worktreeDirs: string[];
  agentGpgKeyId?: string;
  agentGpgName?: string;
  agentGpgEmail?: string;
}
async function findCredentials(startDir: string,): Promise<string | null> {
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
  // Resolve the main repo root via git so the CLI works correctly when
  // invoked from inside a linked worktree (tree/<branch>). REPO_ROOT remains
  // an opt-in escape hatch for CI / non-standard layouts.
  const repoRoot = process.env.REPO_ROOT ?? findRepoRoot();
  const treeDir = process.env.TREE_DIR ?? resolve(repoRoot, "tree",);
  // worktreeDirs expands `tree/` to also include omp's out-of-repo sibling
  // (`OMP_WORKTREE_DIR`) and any `EXTRA_TREE_DIRS`. The canonical in-repo
  // `tree/` stays first so existing layouts and the agent ledger (which
  // lives at <treeDir>/.ledger.jsonl) keep working without surprises.
  const worktreeDirs: string[] = [treeDir,];
  const ompDir = process.env.OMP_WORKTREE_DIR;
  if (ompDir && !worktreeDirs.includes(ompDir,)) { worktreeDirs.push(ompDir,); }
  const extra = process.env.EXTRA_TREE_DIRS;
  if (extra) {
    for (const p of extra.split(":",).map((s,) => s.trim()).filter(Boolean,)) {
      if (!worktreeDirs.includes(p,)) { worktreeDirs.push(p,); }
    }
  }

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
    worktreeDirs,
    agentGpgKeyId,
    agentGpgName,
    agentGpgEmail,
  };
}

export function branchToPath(branch: string,): string {
  return branch.replace(/\//g, "-",);
}

/**
 * Symlink root `.credentials.env` into a worktree so worktree-local scripts
 * (check-parallel.mjs, gpg-unlock.mjs) find agent GPG identity without a
 * parent-walk. Mirrors the node_modules symlink: same pattern, same
 * idempotency, same skip-if-present.
 * @param repoRoot
 * @param wtPath
 */
export function linkWorktreeCredentials(repoRoot: string, wtPath: string,): void {
  const mainCreds = resolve(repoRoot, ".credentials.env",);
  const wtCreds = resolve(wtPath, ".credentials.env",);
  if (existsSync(mainCreds,) && !existsSync(wtCreds,)) {
    symlinkSync(mainCreds, wtCreds,);
    log("success", ".credentials.env linked",);
  }
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
    // Try as directory name across every known container — `tree/` (the
    // repo's own) plus omp's sibling (`OMP_WORKTREE_DIR`) and any extras
    // (`EXTRA_TREE_DIRS`). Dir names under omp's container carry a
    // short-hash suffix (`branch-<hash>`) so we match `<dirName>` first
    // and then `<dirName>-*` to cover that shape.
    const dirName = branchToPath(input,);
    const candidates = [
      dirName,
      ...(process.env.OMP_WORKTREE_DIR ? [`${dirName}-`,] : []),
    ];
    const roots = [
      resolve(repoRoot, "tree",),
      ...(process.env.OMP_WORKTREE_DIR ? [process.env.OMP_WORKTREE_DIR,] : []),
    ];
    for (const root of roots) {
      for (const cand of candidates) {
        const entries = await Array.fromAsync(
          new Bun.Glob(`${cand}*`,).scan({ cwd: root, onlyFiles: false, },),
        );
        for (const entry of entries) {
          const worktreePath = resolve(root, entry,);
          const gitExists = await Bun.file(resolve(worktreePath, ".git",),).exists();
          if (!gitExists) { continue; }
          const headRef = gitSync(worktreePath, "symbolic-ref", "--short", "HEAD",);
          if (headRef === input) { return headRef; }
        }
      }
    }
    return "";
  }
}
