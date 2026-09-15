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
   * Primary worktree container — canonical `<repo>/tree` when it exists on
   * disk (legacy invariant — repos that have always used the in-repo layout
   * must keep their ledger anchor at <canonical>/.ledger.jsonl). Falls back
   * to OMP/extras only when canonical is missing. `TREE_DIR` env override
   * always wins (CI escape hatch). The shared agent ledger and
   * `.credentials.env` symlinks live here. Read/create operations should
   * consult `worktreeDirs` and `git worktree list` for the full picture.
   */
  treeDir: string;
  /**
   * All known worktree container dirs in priority order: `TREE_DIR` env
   * override (explicit user/CI setting, always wins), then `OMP_WORKTREE_DIR`
   * (omp's out-of-repo sibling), then any `EXTRA_TREE_DIRS`, with canonical
   * `<repo>/tree` last as the default fallback. Readers iterate top-down
   * looking for a branch; new worktrees land in `treeDir` (which has its
   * own legacy-invariant logic — canonical when it exists, regardless of
   * what's first here).
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

// ponytail: shared env-parsing helper. loadConfig and resolveBranch both
// consume the same TREE_DIR / OMP_WORKTREE_DIR / EXTRA_TREE_DIRS + canonical
// list; keeping the parsing in one place ensures `treeDir` and
// `worktreeDirs` stay consistent (priority order here is what both sides
// agree on). No file IO, no `.credentials.env` reads — safe for the
// foreign/empty repos resolveBranch historically tolerated.
function getContainerRoots(repoRoot: string,): { roots: string[]; canonical: string } {
  const canonical = resolve(repoRoot, "tree",);
  const roots: string[] = [];
  const explicit = process.env.TREE_DIR;
  if (explicit) { roots.push(explicit,); }
  const ompDir = process.env.OMP_WORKTREE_DIR;
  if (ompDir && !roots.includes(ompDir,)) { roots.push(ompDir,); }
  const extra = process.env.EXTRA_TREE_DIRS;
  if (extra) {
    for (const p of extra.split(":",).map((s,) => s.trim()).filter(Boolean,)) {
      if (!roots.includes(p,)) { roots.push(p,); }
    }
  }
  if (!roots.includes(canonical,)) { roots.push(canonical,); }
  return { roots, canonical, };
}

export async function loadConfig(): Promise<WorktreeConfig> {
  // Resolve the main repo root via git so the CLI works correctly when
  // invoked from inside a linked worktree (tree/<branch>). REPO_ROOT remains
  // an opt-in escape hatch for CI / non-standard layouts.
  const repoRoot = process.env.REPO_ROOT ?? findRepoRoot();
  // treeDir + worktreeDirs derive from the same helper to keep their priority
  // orders in sync. Canonical `<repo>/tree` wins whenever it exists on disk
  // (legacy invariant — repos that have always used the in-repo layout must
  // keep their ledger anchor at <canonical>/.ledger.jsonl). TREE_DIR env
  // override still wins (CI escape hatch); only fall back to OMP/extras
  // when canonical is missing (OMP-only fresh repos). Avoids stealing
  // treeDir from a repo that happens to also have OMP_WORKTREE_DIR exported
  // by another tool.
  const { roots, canonical, } = getContainerRoots(repoRoot,);
  const explicit = process.env.TREE_DIR;
  const treeDir = explicit ?? (existsSync(canonical,) ? canonical : roots.find((d,) => existsSync(d,))) ?? canonical;
  const worktreeDirs = roots;

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
    const dirName = branchToPath(input,);
    const { roots, } = getContainerRoots(repoRoot,);
    // match both `<dirName>` and `<dirName>-*` so we cover either shape.
    const cands = [dirName, ...roots.map(() => `${dirName}-`),]
      .filter((c, i, a,) => a.indexOf(c,) === i);
    // Skip roots whose dir doesn't exist — Bun.Glob throws on a missing cwd,
    // and OMP-only repos may have no in-repo `tree/` at all.
    const existingRoots = roots.filter((r,) => existsSync(r,));
    for (const root of existingRoots) {
      for (const cand of cands) {
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
