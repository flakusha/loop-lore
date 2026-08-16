// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/load/fs.ts — Filesystem lookup helpers

import { existsSync, readFileSync, statSync, } from "node:fs";
import path from "node:path";
import { CONFIG_FILES, NETWORK_FS_PREFIXES, } from "./constants";

/**
 * Detect if a path is on a network filesystem.
 * Checks mount prefixes and /proc/mounts when available.
 */
export function isNetworkFilesystem(filePath: string,): boolean {
  const normalized = path.normalize(filePath,);
  if (NETWORK_FS_PREFIXES.some((prefix,) => normalized.startsWith(prefix,))) {
    return true;
  }
  // Linux: check /proc/mounts for the path's device
  try {
    const mounts = readFileSync("/proc/mounts", "utf8",);
    const lines = mounts.split("\n",);
    for (const line of lines) {
      const parts = line.split(" ",);
      const mountPoint = parts[1];
      const fsType = parts[2];
      if (mountPoint == null || fsType == null) { continue; }
      if (parts.length >= 3 && normalized.startsWith(mountPoint,)) {
        // Network filesystem types
        const networkTypes = [
          "nfs",
          "nfs4",
          "cifs",
          "smb",
          "smbfs",
          "fuse.s3fs",
          "fuse.gcsfuse",
          "fuse.sshfs",
          "fuse.s3",
          "fuse.efs",
          "fuse.juicefs",
          "fuse.goofys",
        ];
        for (const netType of networkTypes) {
          if (fsType === netType) { return true; }
        }
      }
    }
  } catch {
    // Not on Linux or /proc not available — fall through to prefix-only check
  }
  return false;
}

/**
 * Detect if cwd is a git worktree and return the main repo root.
 *
 * In a worktree, `.git` is a file containing:
 *   gitdir: /path/to/main/.git/worktrees/<branch>
 *
 * Returns the main repo root (parent of `.git/`) or null if not in a worktree.
 */
export function findMainRepoRoot(cwd: string,): string | null {
  const gitPath = path.join(cwd, ".git",);
  if (!existsSync(gitPath,)) { return null; }

  // .git is a directory → main repo, not a worktree
  try {
    if (statSync(gitPath,).isDirectory()) { return null; }
  } catch {
    return null;
  }

  // .git is a file — we're in a worktree
  const content = readFileSync(gitPath, "utf8",).trim();
  const match = /^gitdir:\s*(.+)$/.exec(content,);
  if (!match) { return null; }

  const gitdir = match[1]!;
  // gitdir points to <main>/.git/worktrees/<branch>
  // Walk up: worktrees → .git → main root
  const worktreesDir = path.dirname(gitdir,); // <main>/.git/worktrees
  const gitDir = path.dirname(worktreesDir,); // <main>/.git
  const mainRoot = path.dirname(gitDir,); // <main>

  // Verify .git is a directory there (actual main repo)
  const mainGitPath = path.join(mainRoot, ".git",);
  if (existsSync(mainGitPath,)) {
    try {
      if (statSync(mainGitPath,).isDirectory()) { return mainRoot; }
    } catch {
      // fall through
    }
  }
  return null;
}

export function findConfigFile(cwd: string, fileNames: string[] = CONFIG_FILES,): { path: string; ext: string } | null {
  // Search project root, configs/ dir, and main repo root (for worktrees).
  const mainRoot = findMainRepoRoot(cwd,);
  const searchDirs = [cwd, path.join(cwd, "configs",),];
  if (mainRoot && mainRoot !== cwd) {
    searchDirs.push(mainRoot, path.join(mainRoot, "configs",),);
  }
  for (const dir of searchDirs) {
    for (const name of fileNames) {
      const fullPath = path.join(dir, name,);
      if (existsSync(fullPath,)) {
        return { path: fullPath, ext: name.split(".",).pop() as string, };
      }
    }
  }
  return null;
}

/** Return the first existing path among candidate dirs, or null. */
export function firstExisting(candidates: string[],): string | null {
  for (const candidate of candidates) {
    if (existsSync(candidate,)) { return candidate; }
  }
  return null;
}
