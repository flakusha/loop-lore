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
let spillDir = path.join(SPILL_ROOT, String(process.pid,),);

/**
 * Directory this process spills into.
 * @returns absolute path to the current process spill namespace.
 */
export function offloadDir(): string {
  return spillDir;
}

/**
 * Point this process at a different spill directory. Test seam: each test
 * owns a unique `mkdtemp` root, so parallel suites cannot collide.
 * @param dir - absolute path to use as the spill namespace.
 */
export function setOffloadDir(dir: string,): void {
  spillDir = dir;
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
  // Self-sufficient: `apply()` may spill before the daemon's startup
  // `mkdirSync` has run (e.g. in unit tests or an early drain), so ensure
  // the directory exists rather than relying on `startOffloadDaemon()`.
  mkdirSync(spillDir, { recursive: true, },);
  const filePath = path.join(spillDir, `${spillFileStem(id,)}.json.gz`,);
  const bufResult = safeFromString(body, "utf8",);
  if (!bufResult.ok) { throw bufResult.error; }
  const compressed = gzipSync(bufResult.buffer,);
  writeFileSync(filePath, compressed,);
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
