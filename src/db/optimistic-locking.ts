/**
 * Optimistic Concurrency Control Utilities
 *
 * Provides helper functions for implementing optimistic locking using
 * format_version columns. Prevents lost updates in concurrent scenarios.
 */
import type { Kysely, } from "kysely";
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
 *
 * @param db - Kysely database instance
 * @param table - Table name to update
 * @param id - Row ID to update
 * @param currentVersion - Expected current format_version from client
 * @param updates - Fields to update (format_version will be incremented automatically)
 * @returns Result indicating success or version conflict
 */
export async function updateWithVersionCheck(
  db: Kysely<DB>,
  table: string,
  id: string,
  currentVersion: number,
  updates: Record<string, unknown>,
): Promise<OptimisticUpdateResult> {
  const now = new Date().toISOString();

  const result = await db
    .updateTable(table as never,)
    .set({
      ...updates,
      format_version: currentVersion + 1,
      updated_at: now,
    } as never,)
    .where("id" as never, "=", id as never,)
    .where("format_version" as never, "=", currentVersion as never,)
    .executeTakeFirst();

  const rowsAffected = Number(result.numUpdatedRows,);

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
 * Update a row with optimistic concurrency check (no updated_at bump).
 *
 * Same as updateWithVersionCheck but doesn't touch updated_at.
 * Use when you want to manage updated_at yourself.
 *
 * @param db - Kysely database instance
 * @param table - Table name to update
 * @param id - Row ID to update
 * @param currentVersion - Expected current format_version from client
 * @param updates - Fields to update (format_version will be incremented automatically)
 * @returns Result indicating success or version conflict
 */
export async function updateWithVersionCheckRaw(
  db: Kysely<DB>,
  table: string,
  id: string,
  currentVersion: number,
  updates: Record<string, unknown>,
): Promise<OptimisticUpdateResult> {
  const result = await db
    .updateTable(table as never,)
    .set({
      ...updates,
      format_version: currentVersion + 1,
    } as never,)
    .where("id" as never, "=", id as never,)
    .where("format_version" as never, "=", currentVersion as never,)
    .executeTakeFirst();

  const rowsAffected = Number(result.numUpdatedRows,);

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
 *
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
