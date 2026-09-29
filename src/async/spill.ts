// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { createHash, } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync, } from "node:zlib";
import { safeFromString, } from "../utils/safe-buffer";

/**
 * Root directory for spilled bodies. Lives under the repo's `.tmp/` to keep
 *  per-AGENTS.md scratch discipline and avoid stray repo-root files.
 */
export const OFFLOAD_DIR = path.resolve(".tmp", "async-store",);

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
 * Compress + write a body to disk under OFFLOAD_DIR.
 *
 * Exported so `apply.ts` can eagerly spill bodies that exceed the inline
 * threshold at completion time (rather than nulling them and losing the
 * data). BUG-bug-async-store-complete-drops-response-body-larger-than-max.
 * @param id - result row id (hashed into the filename stem)
 * @param body - raw response body text
 * @returns absolute path to the gzipped spill file.
 * @throws If the body cannot be encoded, or the write fails.
 */
export async function spill(id: string, body: string,): Promise<string> {
  // Self-sufficient: `apply()` may spill before the daemon's startup
  // `mkdirSync` has run (e.g. in unit tests or an early drain), so ensure
  // the directory exists rather than relying on `startOffloadDaemon()`.
  mkdirSync(OFFLOAD_DIR, { recursive: true, },);
  const filePath = path.join(OFFLOAD_DIR, `${spillFileStem(id,)}.json.gz`,);
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
 * @returns `true` when the file for that id exists under `OFFLOAD_DIR`.
 */
export function offloadExists(id: string,): boolean {
  return existsSync(path.join(OFFLOAD_DIR, `${spillFileStem(id,)}.json.gz`,),);
}

/**
 * Test seam: total bytes under OFFLOAD_DIR.
 * @returns sum of `*.json.gz` file sizes under `OFFLOAD_DIR`, or `0` when the directory does not exist.
 */
export function offloadDiskBytes(): number {
  if (!existsSync(OFFLOAD_DIR,)) { return 0; }
  // Bun's `Glob` is overkill; a flat scan is fine for the `.tmp/async-store/`
  // directory (only `*.json.gz` files; no recursion).
  let total = 0;
  for (const name of readdirSync(OFFLOAD_DIR,)) {
    if (!name.endsWith(".json.gz",)) { continue; }
    try {
      total += statSync(path.join(OFFLOAD_DIR, name,),).size;
    } catch { /* raced with another writer */ }
  }
  return total;
}
