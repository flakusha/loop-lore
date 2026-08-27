// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Content-versioning registry + envelope builder.
 *
 * Maps `(table, data_version)` to `(column_projection)` so a batch runner can
 * recompute `record_hash` for every row when the envelope shape changes.
 *
 * The registry is process-local (no DB persistence) — it is populated by
 * service-layer hooks AND by migration `up()` bodies that add tracked columns.
 * Idempotent on duplicate `(table, data_version)` registrations.
 *
 * Why this lives in src/db/ and not src/hash/:
 *   - The registry is consumed by `runBatchRefresh` which talks to the
 *     database. It is an orchestration concern, not a pure-hash concern.
 *   - src/hash/record-hash.ts is pure (no I/O); src/db/content-version.ts
 *     performs SQL I/O via `Kysely<any>`. Separation lets the pure
 *     helper stay side-effect-free and testable without a DB.
 *
 * @see TASK-middleware-migration-compaction-data-version-hash.md
 * @see epic-content-hashing-distributed-integrity.md
 */

import type { Kysely } from "kysely";
import { asTableName, computeRecordHash, type TableName } from "../hash/record-hash";

/** A registered content version. */
interface ContentVersion {
  /** Tracked columns (canonical order, lower case). */
  columns: readonly string[];
}

/** Process-local registry: table → data_version → projection. */
const REGISTRY = new Map<string, Map<number, ContentVersion>>();

/**
 * Register a content-version projection for `(table, data_version)`.
 *
 * Idempotent: registering the same `(table, data_version)` twice with the
 * same `columns` array is a no-op. Registering with DIFFERENT columns for
 * the same version throws — it is a programming error that would silently
 * invalidate every cached `record_hash`.
 *
 * @param table - Canonical table name.
 * @param dataVersion - The integer version this projection belongs to.
 * @param columns - Tracked columns (lowercase). Order matters: hashes are
 *   sensitive to the projection order via the canonical JSON envelope.
 */
export function registerContentVersion(
  table: string,
  dataVersion: number,
  columns: readonly string[],
): void {
  if (!Number.isInteger(dataVersion) || dataVersion < 1) {
    throw new Error(`content-version: invalid data_version ${dataVersion}`);
  }
  if (columns.length === 0) {
    throw new Error(`content-version: empty column projection for ${table}@v${dataVersion}`);
  }
  const normalized = [...columns].map((c) => c.toLowerCase()).sort();
  const existing = REGISTRY.get(table);
  const current = existing?.get(dataVersion);
  if (current) {
    if (
      current.columns.length === normalized.length &&
      current.columns.every((c, i) => c === normalized[i])
    ) {
      return; // idempotent re-registration
    }
    throw new Error(
      `content-version: ${table}@v${dataVersion} already registered with different columns`,
    );
  }
  if (!existing) {
    REGISTRY.set(table, new Map());
  }
  REGISTRY.get(table)!.set(dataVersion, { columns: normalized });
}

/**
 * Build the canonical JSON envelope for a row at its `data_version`.
 *
 * `table` is branded inside; the helper looks up the column projection for
 * `(table, row.data_version)` and emits the projection's columns as a plain
 * object — the same envelope shape that `computeRecordHash` signs. Callers
 * wrap the result with `computeRecordHash` to produce the digest.
 *
 * @param table - Canonical table name (use `asTableName`).
 * @param row - A row object containing at minimum `id` and `data_version`.
 * @returns The canonical envelope object (un-hashed). Returns `null` when
 *   the projection is unknown — callers MUST treat this as a backfill
 *   failure (the migration that should have registered the projection
 *   was never run, or the registry was cleared).
 */
export function getContentEnvelope(
  table: TableName,
  row: { data_version: number } & Record<string, unknown>,
): Record<string, unknown> | null {
  const projection = REGISTRY.get(table);
  if (!projection) { return null; }
  const cv = projection.get(row.data_version);
  if (!cv) { return null; }
  const envelope: Record<string, unknown> = {};
  for (const col of cv.columns) {
    const value = (row as Record<string, unknown>)[col];
    if (value !== undefined) { envelope[col] = value; }
  }
  return envelope;
}

/**
 * Compute the canonical record_hash for a row at its `data_version`.
 *
 * Convenience wrapper around `getContentEnvelope` + `computeRecordHash`.
 * Returns `null` when the projection is missing (callers log + skip).
 *
 * @param table - Canonical table name.
 * @param row - A row object containing `id` + `data_version` + the tracked columns.
 */
export function computeRowHash(
  table: TableName,
  row: { id: string; data_version: number } & Record<string, unknown>,
): string | null {
  const envelope = getContentEnvelope(table, row);
  if (!envelope) { return null; }
  // The PK is always part of the envelope; the envelope projection columns
  // are content-defining (the row's tracked columns). computeRecordHash
  // adds `v` automatically via its internal stamping.
  return computeRecordHash(table, row.id, envelope);
}

/**
 * Recompute `record_hash` for every row of a table where the tracked
 * columns changed since the last refresh.
 *
 * Strategy: select all `(id, data_version, *tracked_columns*)` rows in
 * batches of `opts.batchSize`, compute the hash in-process, and UPDATE.
 * The `WHERE data_version = ?` predicate lets a future migration increment
 * `data_version` and re-run the refresh — rows at the previous version are
 * re-hashed with the new projection on the next call.
 *
 * @param database - Kysely handle (typed `any` because the column set is
 *   driven by the runtime registry, not the static DB type).
 * @param table - Canonical table name.
 * @param opts - `dataVersion` filter + batch size (default 500).
 * @returns Counts: `{ scanned, updated, skipped }`. `skipped` covers rows
 *   whose projection is unknown (caller MUST investigate).
 */
export async function runBatchRefresh(
  database: Kysely<any>,
  table: string,
  opts: { dataVersion?: number; batchSize?: number } = {},
): Promise<{ scanned: number; updated: number; skipped: number }> {
  const tableName = asTableName(table);
  const batchSize = opts.batchSize ?? 500;
  const dataVersion = opts.dataVersion;
  const projection = REGISTRY.get(tableName);
  if (!projection) {
    return { scanned: 0, updated: 0, skipped: 0 };
  }

  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  // Stream rows in batches. We use OFFSET/LIMIT because SQLite supports it
  // for primary-key-ordered scans. The PK index keeps the seek cheap.
  let offset = 0;
  for (;;) {
    const rows = (await database
      .selectFrom(tableName)
      .select(["id", "data_version", ...projectionColumns(projection)])
      .$if(dataVersion !== undefined, (qb) => qb.where("data_version", "=", dataVersion))
      .orderBy("id")
      .limit(batchSize)
      .offset(offset)
      .execute()) as Array<
        & { id: string; data_version: number; record_hash?: string }
        & Record<string, unknown>
      >;
    if (rows.length === 0) { break; }
    scanned += rows.length;
    for (const row of rows) {
      const hash = computeRowHash(tableName, row);
      if (!hash) {
        skipped++;
        continue;
      }
      if (row.record_hash === hash) { continue; }
      await database
        .updateTable(tableName)
        .set({ record_hash: hash })
        .where("id", "=", row.id)
        .execute();
      updated++;
    }
    if (rows.length < batchSize) { break; }
    offset += batchSize;
  }

  return { scanned, updated, skipped };
}

/**
 * Flatten all registered projections into a single column set. The hash
 * helper reads via `getContentEnvelope`, which picks the right projection
 * per row's data_version; the SELECT just needs every column the registry
 * might reference across versions.
 */
function projectionColumns(projection: Map<number, ContentVersion>): string[] {
  const seen = new Set<string>();
  for (const cv of projection.values()) {
    for (const col of cv.columns) { seen.add(col); }
  }
  if (!seen.has("id")) { seen.add("id"); }
  if (!seen.has("data_version")) { seen.add("data_version"); }
  return [...seen];
}

/** Test seam: clear the registry. NOT FOR PRODUCTION. */
export function __resetContentVersionRegistry(): void {
  REGISTRY.clear();
}

/** Test seam: peek the registry. NOT FOR PRODUCTION. */
export function __peekContentVersionRegistry(): ReadonlyMap<string, ReadonlyMap<number, readonly string[]>> {
  const out = new Map<string, ReadonlyMap<number, readonly string[]>>();
  for (const [table, versions] of REGISTRY) {
    out.set(table, new Map([...versions].map(([v, cv]) => [v, cv.columns] as const)));
  }
  return out;
}