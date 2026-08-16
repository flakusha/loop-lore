// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared RPG service utilities — deduplicated helpers used across service files.
 */
import type { Kysely, } from "kysely";
import { getLogger, } from "../../logger";
import type { Logger, } from "../../logger";
import { safeJsonParse, uid, } from "../../utils";

/**
 * Create a module-scoped logger for RPG services.
 * Replaces the per-service `getLog()` wrapper pattern.
 */
export function getRpgLog(moduleName: string,): Logger {
  return getLogger().child({ module: moduleName, },);
}

/** Generate a new ID and timestamp */
export function nowAndId(): { id: string; now: string } {
  return { id: uid(), now: new Date().toISOString(), };
}

/** Assert that at least one row was updated */
export function assertRowUpdated(numRows: number, label: string,): void {
  if (numRows === 0) {
    throw new Error(`${label} not found`,);
  }
}

/** Assert that at least one row was deleted */
export function assertRowDeleted(numRows: number, label: string,): void {
  if (numRows === 0) {
    throw new Error(`${label} not found`,);
  }
}

/** Parse a JSON field safely from an unknown source, returning fallback on error or non-string input */
export function parseJsonField<T,>(raw: unknown, fallback: T,): T {
  if (typeof raw !== "string") { return fallback; }
  const result = safeJsonParse<T>(raw,);
  return result.ok ? result.value : fallback;
}

/** Get or create a row — eliminates the get-then-insert pattern */
export async function getOrCreateRow<DB, T extends keyof DB & string,>(
  db: Kysely<DB>,
  table: T,
  findFn: () => Promise<DB[T] | undefined>,
  insertData: DB[T],
): Promise<DB[T]> {
  const existing = await findFn();
  if (existing) { return existing; }
  await db.insertInto(table,).values(insertData as any,).execute();
  return insertData;
}
