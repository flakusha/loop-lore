// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { readdirSync, rmdirSync, statSync, unlinkSync, } from "node:fs";
import path from "node:path";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { SPILL_ROOT, } from "./spill";

/**
 * Every `*.json.gz` spill file under `dir`, descending one level into
 * per-process namespace directories (`<SPILL_ROOT>/<pid>/`) so leftovers from a
 * dead process are collectable. Unreadable entries are skipped, not thrown on:
 * a sweep racing another sweep is normal.
 * @param dir - spill root to scan.
 * @returns absolute paths to the spill files found.
 */
function collectSpillFiles(dir: string,): string[] {
  let names: string[];
  try {
    names = readdirSync(dir,);
  } catch {
    return []; // no spill dir yet — nothing to sweep
  }
  const found: string[] = [];
  for (const name of names) {
    const entry = path.join(dir, name,);
    if (name.endsWith(".json.gz",)) {
      found.push(entry,);
      continue;
    }
    let inner: string[];
    try {
      if (!statSync(entry,).isDirectory()) { continue; }
      inner = readdirSync(entry,);
    } catch {
      continue;
    }
    for (const leaf of inner) {
      if (leaf.endsWith(".json.gz",)) { found.push(path.join(entry, leaf,),); }
    }
  }
  return found;
}

/**
 * Drop per-process namespace directories the sweep has emptied, so the root's
 * entry count stays bounded instead of growing one dir per process that ever
 * spilled. Never removes `dir` itself, and never a non-empty child (a live
 * process may still be spilling into it — `spill()` re-creates the directory on
 * demand, so racing a live writer is harmless).
 * @param dir - spill root whose child namespaces are candidates for removal.
 */
function removeEmptyNamespaces(dir: string,): void {
  let names: string[];
  try {
    names = readdirSync(dir,);
  } catch {
    return;
  }
  for (const name of names) {
    const child = path.join(dir, name,);
    try {
      if (!statSync(child,).isDirectory()) { continue; }
      if (readdirSync(child,).length > 0) { continue; }
      rmdirSync(child,);
    } catch { /* raced with a live writer — harmless, it re-creates on demand */ }
  }
}

/**
 * Retention cap for spill files nothing references any more. Phase 3 of
 * `runOffloadPass` only deletes spills it can map back to an `expired` row;
 * files orphaned by DB resets, deleted rows, or aborted runs would otherwise
 * grow unbounded (observed: 279 never-pruned `.json.gz` files in a dev
 * checkout). This sweep removes any `*.json.gz` older than 2× TTL that no
 * `request_results.offload_path` references, across every per-process namespace
 * under `SPILL_ROOT`. Files still referenced by any row — regardless of row
 * status — are always kept.
 * @param database - Kysely handle
 * @param opts - ttlMs sets the 2× age cutoff; `now`/`dir` are test seams.
 * @returns number of orphaned spill files removed.
 */
export async function pruneOrphanSpills(
  database: Kysely<DB>,
  opts: { ttlMs: number; now?: number; dir?: string },
): Promise<number> {
  const log = getLogger().child({ module: "async-offload", },);
  // Sweep the ROOT, not the current process namespace: spills are written to
  // `<SPILL_ROOT>/<pid>/`, so scanning one flat namespace would never collect
  // what a dead process left behind (BUG-test-async-store-offload-dir-fixed-path-race).
  const dir = opts.dir ?? SPILL_ROOT;
  const cutoffMs = (opts.now ?? Date.now()) - 2 * opts.ttlMs;
  const found = collectSpillFiles(dir,);
  const candidates: string[] = [];
  for (const filePath of found) {
    let mtimeMs: number;
    try {
      mtimeMs = statSync(filePath,).mtimeMs;
    } catch {
      /* raced with another writer/sweeper */ continue;
    }
    if (mtimeMs <= cutoffMs) { candidates.push(filePath,); }
  }
  // Clean namespaces on BOTH exit paths: a dead process's namespace can be empty
  // (or emptied by an earlier sweep) while still leaving its directory behind.
  if (candidates.length === 0) {
    removeEmptyNamespaces(dir,);
    return 0;
  }
  // Chunked IN query (SQLite host-parameter limit) — anything referenced by
  // any row survives, so a chunking race can only over-retain, never delete.
  const referenced = new Set<string>();
  const CHUNK = 500;
  for (let i = 0; i < candidates.length; i += CHUNK) {
    const rows = await database
      .selectFrom("request_results",)
      .select("offload_path",)
      .where("offload_path", "in", candidates.slice(i, i + CHUNK,),)
      .execute();
    for (const row of rows) {
      if (row.offload_path !== null) { referenced.add(row.offload_path,); }
    }
  }
  let pruned = 0;
  for (const filePath of candidates) {
    if (referenced.has(filePath,)) { continue; }
    try {
      unlinkSync(filePath,);
      pruned++;
    } catch { /* raced with another writer — keep going */ }
  }
  if (pruned > 0) {
    log.info("pruned orphaned spill files", { pruned, scanned: candidates.length, },);
  }
  removeEmptyNamespaces(dir,);
  return pruned;
}
