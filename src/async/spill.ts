// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { createHash, } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync, } from "node:zlib";
import { safeFromString, } from "../utils/safe-buffer";

/**
 * Repo-local root holding every spill namespace. Under the repo's `.tmp/` to
 * keep per-AGENTS.md scratch discipline; CWD-relative, so each worktree has
 * its own. The retention sweep scans this root, not the current namespace, so
 * files left behind by a dead process are still collected.
 */
export const SPILL_ROOT = path.resolve(".tmp", "async-store",);

/**
 * This process's spill namespace under `SPILL_ROOT`.
 *
 * BUG-async-spill-offload-dir-is-a-fixed-cwd-relative-path-shared-: the app,
 * every test file and every parallel test process used to share ONE flat
 * directory, so concurrent runs raced on `mkdirSync`/`writeFileSync` and
 * leaked residue into each other. The pid suffix makes the namespace unique
 * per process; tests override it with `setOffloadDir`.
 */
const DEFAULT_DIR = path.join(SPILL_ROOT, String(process.pid,),);
let spillDir = DEFAULT_DIR;

/**
 * Root the retention sweep scans. Equals `SPILL_ROOT` in production, so the
 * sweep reaches namespaces left by dead processes; `setOffloadDir` narrows it
 * so a test's sweep stays inside the directory that test owns.
 */
let spillRoot = SPILL_ROOT;

/**
 * Directory this process spills into.
 * @returns absolute path to the current process spill namespace.
 */
export function offloadDir(): string {
  return spillDir;
}

/**
 * Root directory the retention sweep scans, covering every process namespace.
 * @returns absolute path to the sweep root.
 */
export function spillRootDir(): string {
  return spillRoot;
}

/**
 * Point this process at a different spill area. Test seam: each test owns a
 * unique `mkdtemp` root, so parallel suites cannot collide. This moves BOTH the
 * directory this process writes to and the root the retention sweep scans —
 * otherwise every `runOnce()` in a test would sweep the shared `SPILL_ROOT` and
 * could delete a concurrent process's spill files.
 * @param dir - absolute path to use as this process's spill area.
 */
export function setOffloadDir(dir: string,): void {
  spillDir = dir;
  spillRoot = dir;
}

/**
 * Restore this process's default spill area after a test narrowed it. Restores
 * BOTH the namespace and the sweep root — calling `setOffloadDir` with the
 * default namespace instead would leave the sweep root pointed at this
 * process's own namespace rather than at `SPILL_ROOT`.
 */
export function resetOffloadDir(): void {
  spillDir = DEFAULT_DIR;
  spillRoot = SPILL_ROOT;
}

/**
 * Map a result-row id to a filesystem-safe stem.
 *
 * The id is an idempotency cache key (`makeKey()` builds
 * `${METHOD} ${routePattern} ${userId} ${requestId}`), so it contains `/`
 * and spaces — using it verbatim made `path.join` target a nested path
 * whose parents do not exist, and the write failed with ENOENT.
 * SHA-256 is collision-resistant enough here and keeps distinct ids on
 * distinct files. The row's `offload_path` records the mapping, so nothing
 * needs to reverse it.
 * @param id - result row id
 * @returns hex digest, safe as a single path segment
 */
export function spillFileStem(id: string,): string {
  return createHash("sha256",).update(id,).digest("hex",);
}

/**
 * Compress + write a body to disk under the process spill namespace.
 *
 * Exported so `apply.ts` can eagerly spill bodies that exceed the inline
 * threshold at completion time (rather than nulling them and losing the
 * data). BUG-bug-async-store-complete-drops-response-body-larger-than-max.
 *
 * @param id - result row id (hashed into the filename stem)
 * @param body - raw response body text
 * @returns absolute path to the gzipped spill file.
 * @throws If the body cannot be encoded, or the write fails.
 */
export async function spill(id: string, body: string,): Promise<string> {
  const filePath = path.join(spillDir, `${spillFileStem(id,)}.json.gz`,);
  const bufResult = safeFromString(body, "utf8",);
  if (!bufResult.ok) { throw bufResult.error; }
  const compressed = gzipSync(bufResult.buffer,);
  // Self-sufficient: `apply()` may spill before the daemon's startup
  // `mkdirSync` has run (e.g. in unit tests or an early drain), so ensure
  // the directory exists rather than relying on `startOffloadDaemon()`.
  //
  // Compress BEFORE creating the directory, and retry ENOENT on the write.
  // `pruneOrphanSpills` deletes namespace directories it finds EMPTY, so a
  // sibling process sharing this SPILL_ROOT can rmdir ours mid-write. With the
  // old order (mkdir -> gzip -> write) the namespace sat empty for the whole
  // compress, and a two-process hammer measured 1 successful spill against 60
  // ENOENT failures: every lost write throws out of `apply()` and drops an
  // oversized response body on the floor, exactly the loss
  // BUG-bug-async-store-complete-drops-response-body-larger-than-max exists to
  // prevent. Compressing first shrinks the remaining mkdir->write window to
  // microseconds; the retry closes it. One retry suffices — a sweep removes a
  // given directory at most once, and `recursive` recreates it. Only ENOENT
  // retries: ENOSPC/EACCES must surface rather than masquerade as a race.
  try {
    mkdirSync(spillDir, { recursive: true, },);
    writeFileSync(filePath, compressed,);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") { throw error; }
    mkdirSync(spillDir, { recursive: true, },);
    writeFileSync(filePath, compressed,);
  }

  return filePath;
}

/**
 * Read a body back from disk (used by the status endpoint).
 * @param filePath - absolute path to a gzipped spill file
 * @returns decompressed body string, or `null` if the file is missing or unreadable.
 */
export function readOffloadedBody(filePath: string,): string | null {
  try {
    if (!existsSync(filePath,)) { return null; }
    const compressed = readFileSync(filePath,);
    return gunzipSync(compressed,).toString("utf8",);
  } catch {
    return null;
  }
}

/**
 * Test seam: report whether a spill file exists for a given id.
 * @param id - result row id
 * @returns `true` when the file for that id exists in the process spill namespace.
 */
export function offloadExists(id: string,): boolean {
  return existsSync(path.join(spillDir, `${spillFileStem(id,)}.json.gz`,),);
}

/**
 * Test seam: total bytes under the process spill namespace.
 * @returns sum of `*.json.gz` file sizes in the process spill namespace, or `0` when the directory does not exist.
 */
export function offloadDiskBytes(): number {
  if (!existsSync(spillDir,)) { return 0; }
  // Bun's `Glob` is overkill; a flat scan is fine for one process namespace
  // (only `*.json.gz` files directly inside it; no recursion).
  let total = 0;
  for (const name of readdirSync(spillDir,)) {
    if (!name.endsWith(".json.gz",)) { continue; }
    try {
      total += statSync(path.join(spillDir, name,),).size;
    } catch { /* raced with another writer */ }
  }

  return total;
}
