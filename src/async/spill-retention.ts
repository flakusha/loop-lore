// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { readdirSync, statSync, unlinkSync, } from "node:fs";
import path from "node:path";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { OFFLOAD_DIR, } from "./spill";

/**
 * Retention cap for spill files nothing references any more. Phase 3 of
 * `runOffloadPass` only deletes spills it can map back to an `expired` row;
 * files orphaned by DB resets, deleted rows, or aborted runs would otherwise
 * grow unbounded (observed: 279 never-pruned `.json.gz` files in a dev
 * checkout). This sweep removes any `*.json.gz` older than 2× TTL that no
 * `request_results.offload_path` references. Files still referenced by any
 * row — regardless of row status — are always kept.
 * @param database - Kysely handle
 * @param opts - ttlMs sets the 2× age cutoff; `now`/`dir` are test seams.
 * @returns number of orphaned spill files removed.
 */
export async function pruneOrphanSpills(
  database: Kysely<DB>,
  opts: { ttlMs: number; now?: number; dir?: string },
): Promise<number> {
  const log = getLogger().child({ module: "async-offload", },);
  const dir = opts.dir ?? OFFLOAD_DIR;
  const cutoffMs = (opts.now ?? Date.now()) - 2 * opts.ttlMs;
  let names: string[];
  try {
    names = readdirSync(dir,);
  } catch {
    return 0; // no spill dir yet — nothing to sweep
  }
  const candidates: string[] = [];
  for (const name of names) {
    if (!name.endsWith(".json.gz",)) { continue; }
    const filePath = path.join(dir, name,);
    let mtimeMs: number;
    try {
      mtimeMs = statSync(filePath,).mtimeMs;
    } catch {
      /* raced with another writer/sweeper */ continue;
    }
    if (mtimeMs <= cutoffMs) { candidates.push(filePath,); }
  }
  if (candidates.length === 0) { return 0; }
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
  return pruned;
}
