// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/routes/harness/files.ts — approach C: read-only sandbox file tree
// (epic-browser-editor-support). One directory level per request, chrooted to
// the run's sandbox root via the realpath-hardened isWithin helper: `..`,
// absolute paths, and escaping symlinks are rejected; a symlink that itself
// escapes is skipped from listings rather than leaked. Writes never happen
// here — the editor (approach B) owns writes.

import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep, } from "node:path";

import type { HarnessRunRecord, } from "../../harness/types";
import { isWithin, } from "../../utils/is-within";

/** One listed sandbox entry (dirs carry size 0; both carry mtime). */
export interface SandboxFileEntry {
  name: string;
  /** Repo-relative path from the sandbox root, `/`-separated. */
  path: string;
  type: "file" | "dir";
  size: number;
  mtimeMs: number;
}

/** The `/files` response body. */
export interface SandboxFilesBody {
  /** Repo-relative sandbox root, so the client can build editor links. */
  root: string;
  /** The listed subdirectory, `""` for the root. */
  path: string;
  entries: SandboxFileEntry[];
}

/** Why a listing refused to run (route maps each to an HTTP status). */
export type SandboxFilesError =
  | { kind: "no-run" }
  | { kind: "no-sandbox" }
  | { kind: "escape" }
  | { kind: "not-found" }
  | { kind: "io"; message: string };

/**
 * The sandbox root of one run: loop-lore agent runs execute in giwt
 * worktrees under `tree/<branch>`, and the run record's `branch` names that
 * worktree (run-context.ts reads it from git). Runs without a branch, or
 * whose worktree no longer exists, have no sandbox to list.
 * @param record - the run record from the exec log.
 * @param repoRoot - absolute repo root (server cwd).
 * @returns the absolute sandbox root, or null when the run has none.
 */
export function sandboxRootForRun(record: HarnessRunRecord, repoRoot: string,): string | null {
  if (!record.branch || record.branch.includes("/",) || record.branch.includes("\\",)) { return null; }

  // Strictly inside `tree/`: a branch of `..` would otherwise resolve the
  // sandbox root to the repo root itself and hand out the whole repo.
  const treeRoot = resolve(repoRoot, "tree",);
  const candidate = resolve(treeRoot, record.branch,);
  if (candidate === treeRoot || !isWithin(treeRoot, candidate,)) { return null; }

  try {
    return fs.statSync(candidate,).isDirectory() ? candidate : null;
  } catch {
    return null;
  }
}

/**
 * List one directory level inside the sandbox.
 * @param root - absolute sandbox root.
 * @param relPath - requested subdirectory (`""` = root).
 * @returns sorted entries (dirs first, then files, each alpha) or the refusal.
 */
export async function listSandboxDir(
  root: string,
  relPath: string,
): Promise<Omit<SandboxFilesBody, "root"> | SandboxFilesError> {
  if (isAbsolute(relPath,) || relPath.split(/[\\/]/,).includes("..",)) {
    return { kind: "escape", };
  }

  const dir = resolve(root, relPath,);
  if (!isWithin(root, dir,)) {
    return { kind: "escape", };
  }

  let dirents;
  try {
    dirents = await fsPromises.readdir(dir, { withFileTypes: true, },);
  } catch (error: unknown) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind: "not-found", };
    }

    if (error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOTDIR") {
      return { kind: "not-found", };
    }

    return { kind: "io", message: error instanceof Error ? error.message : String(error,), };
  }

  const entries: SandboxFileEntry[] = [];
  for (const dirent of dirents) {
    const abs = join(dir, dirent.name,);
    // Skip anything whose real path escapes the sandbox (escaping symlinks,
    // mount tricks). Skipping — not erroring — keeps the tree total: one bad
    // link never hides the rest of a run's files.
    if (!isWithin(root, abs,)) { continue; }

    let info;
    try {
      info = await fsPromises.stat(abs,);
    } catch {
      // Raced away (deleted between readdir and stat) — skip it.
      continue;
    }

    entries.push({
      name: dirent.name,
      path: toPosix(relative(root, abs,),),
      type: info.isDirectory() ? "dir" : "file",
      size: info.isFile() ? info.size : 0,
      mtimeMs: Math.round(info.mtimeMs,),
    },);
  }

  entries.sort((a, b,) => a.type === b.type ? a.name.localeCompare(b.name,) : a.type === "dir" ? -1 : 1);
  return { path: relPath, entries, };
}

/**
 * Resolve a run's sandbox listing end-to-end (route body).
 * @param opts - run id fetcher, repo root, and the requested subdirectory.
 * @returns the body with `root` filled in, or the refusal.
 */
export async function harnessRunFiles(opts: {
  runId: string;
  relPath: string;
  repoRoot: string;
  getRun: (runId: string,) => Promise<HarnessRunRecord | null>;
},): Promise<SandboxFilesBody | SandboxFilesError> {
  const record = await opts.getRun(opts.runId,);
  if (record === null) { return { kind: "no-run", }; }

  const root = sandboxRootForRun(record, opts.repoRoot,);
  if (root === null) { return { kind: "no-sandbox", }; }

  const listed = await listSandboxDir(root, opts.relPath,);
  if ("kind" in listed) { return listed; }

  return { ...listed, root: toPosix(relative(opts.repoRoot, root,),), };
}

/** Windows separators have no place in wire paths. */
function toPosix(p: string,): string {
  return sep === "\\" ? p.split(sep,).join("/",) : p;
}
