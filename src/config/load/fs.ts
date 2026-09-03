// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/load/fs.ts — Filesystem lookup helpers

import { existsSync, readFileSync, } from "node:fs";
import path from "node:path";
import { CONFIG_FILES, NETWORK_FS_PREFIXES, } from "./constants";
import { findMainRepoRoot, } from "../../utils/git-worktree";

/**
 * Detect if a path is on a network filesystem.
 * Checks mount prefixes and /proc/mounts when available.
 * @param filePath
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
 * @param cwd
 * @param fileNames
 */
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

/**
 * Return the first existing path among candidate dirs, or null.
 * @param candidates
 */
export function firstExisting(candidates: string[],): string | null {
  for (const candidate of candidates) {
    if (existsSync(candidate,)) { return candidate; }
  }
  return null;
}
