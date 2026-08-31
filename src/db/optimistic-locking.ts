// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Optimistic Concurrency Control Utilities
 *
 * Provides helper functions for implementing optimistic locking using
 * format_version columns. Prevents lost updates in concurrent scenarios.
 */
import { type Kysely, sql, } from "kysely";
import type { DB, } from "./schema";

/**
 * Result of an optimistic update attempt.
 */
export interface OptimisticUpdateResult {
  /** Whether the update succeeded */
  ok: boolean;
  /** Number of rows affected */
  rowsAffected: number;
  /** Error message if update failed due to version mismatch */
  error?: string;
}

/**
 * Update a row with optimistic concurrency check.
 *
 * Uses `WHERE format_version = ?` to detect concurrent modifications.
 * If the version doesn't match, returns an error instead of overwriting.
 * @param db - Kysely database instance
 * @param table - Table name to update
 * @param id - Row ID to update
 * @param currentVersion - Expected current format_version from client
 * @param updates - Fields to update (format_version will be incremented automatically)
 * @returns Result indicating success or version conflict
 */
export async function updateWithVersionCheck(
  db: Kysely<DB>,
  table: keyof DB,
  id: string,
  currentVersion: number,
  updates: Record<string, unknown>,
): Promise<OptimisticUpdateResult> {
  const now = new Date().toISOString();
  const rowsAffected = await applyOptimisticUpdate(db, table, id, currentVersion, updates, {
    bumpUpdatedAt: true,
    now,
  },);

  if (rowsAffected === 0) {
    return {
      ok: false,
      rowsAffected: 0,
      error: "Version conflict: record was modified by another process",
    };
  }

  return {
    ok: true,
    rowsAffected,
  };
}

/**
 * Build and execute the optimistic UPDATE via raw SQL.
 *
 * The table name and column set are dynamic (callers pass arbitrary tables
 * and partial update objects), which Kysely's typed builder cannot express
 * for a generic table — so the statement is composed with the `sql`
 * template (ref/value interpolation, no string concatenation of values).
 * @param db
 * @param table
 * @param id
 * @param currentVersion
 * @param updates
 * @param opts
 * @param opts.bumpUpdatedAt
 * @param opts.now
 * @returns Number of rows affected by the UPDATE
 */
async function applyOptimisticUpdate(
  db: Kysely<DB>,
  table: keyof DB,
  id: string,
  currentVersion: number,
  updates: Record<string, unknown>,
  opts: { bumpUpdatedAt: boolean; now?: string },
): Promise<number> {
  const entries = Object.entries({
    ...updates,
    format_version: currentVersion + 1,
    ...(opts.bumpUpdatedAt && { updated_at: opts.now!, }),
  },);

  const assignments: ReturnType<typeof sql.ref>[] = [];
  for (const [column, value,] of entries) {
    assignments.push(sql`${sql.ref(column,)} = ${sql.val(value,)}`,);
  }
  const result = await sql`
    update ${sql.table(table,)}
    set ${sql.join(assignments, sql`, `,)}
    where ${sql.ref("id",)} = ${id} and ${sql.ref("format_version",)} = ${currentVersion}
  `.execute(db,);

  return Number(result.numAffectedRows,);
}

/**
 * Update a row with optimistic concurrency check (no updated_at bump).
 *
 * Same as updateWithVersionCheck but doesn't touch updated_at.
 * Use when you want to manage updated_at yourself.
 * @param db - Kysely database instance
 * @param table - Table name to update
 * @param id - Row ID to update
 * @param currentVersion - Expected current format_version from client
 * @param updates - Fields to update (format_version will be incremented automatically)
 * @returns Result indicating success or version conflict
 */
export async function updateWithVersionCheckRaw(
  db: Kysely<DB>,
  table: keyof DB,
  id: string,
  currentVersion: number,
  updates: Record<string, unknown>,
): Promise<OptimisticUpdateResult> {
  const rowsAffected = await applyOptimisticUpdate(db, table, id, currentVersion, updates, { bumpUpdatedAt: false, },);

  if (rowsAffected === 0) {
    return {
      ok: false,
      rowsAffected: 0,
      error: "Version conflict: record was modified by another process",
    };
  }

  return {
    ok: true,
    rowsAffected,
  };
}

/**
 * Fetch current format_version for a row.
 * @param db - Kysely database instance
 * @param table - Table name
 * @param id - Row ID
 * @returns Current format_version, or null if row not found
 */
export async function getCurrentVersion(
  db: Kysely<DB>,
  table: string,
  id: string,
): Promise<number | null> {
  const row = await db
    .selectFrom(table as never,)
    .select(["format_version" as never,],)
    .where("id" as never, "=", id as never,)
    .executeTakeFirst();

  return row ? Number((row as Record<string, unknown>).format_version,) : null;
}
