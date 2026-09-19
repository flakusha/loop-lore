// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type Kysely, sql, } from "kysely";
import { getLogger, } from "../logger";

/**
 * Migration helpers — reusable utilities for schema transformations.
 *
 * These are imported by migration files but NOT tracked as migrations
 * themselves (the directory scanner only picks up files matching `\d{3}_*.ts`).
 */

/**
 * Convert a boolean integer column (0/1) to a text enum.
 *
 * Creates a temp column, copies data, drops the original, and renames.
 * Handles index rebuilds automatically.
 *
 * Whole conversion runs in one transaction (SAVEPOINT when already inside
 * the Migrator's transaction) — a failure mid-way leaves the original
 * column untouched instead of an orphaned temp column. Values other than
 * 0/1/null are counted and logged before any DDL, then coerce to
 * `falseValue` — the log makes that coercion loud, not silent.
 *
 * @param db - Kysely instance
 * @param table - Table name
 * @param column - Column to convert
 * @param trueValue - Text value when old value was 1 (e.g. "pinned")
 * @param falseValue - Text value when old value was 0 (e.g. "unpinned")
 * @param options - Optional: index rebuild config
 * @param options.indexColumns
 * @param options.oldIndexName
 */
export async function boolToEnum(
  db: Kysely<any>,
  table: string,
  column: string,
  trueValue: string,
  falseValue: string,
  options?: {
    indexColumns?: string[];
    oldIndexName?: string;
  },
): Promise<void> {
  const log = getLogger().child({ module: "migration-helpers", },);

  // Audit non-0/1 values BEFORE any DDL: anything other than 0/1/null would
  // silently coerce to falseValue below — surface it loudly instead.
  const weird = await sql<{ c: number }>`
    SELECT COUNT(*) AS c FROM ${sql.table(table,)}
    WHERE ${sql.ref(column,)} IS NOT NULL AND ${sql.ref(column,)} NOT IN (0, 1)
  `.execute(db,);
  const weirdCount = Number(weird.rows[0]?.c ?? 0,);
  if (weirdCount > 0) {
    log.warn(
      `boolToEnum: ${weirdCount} row(s) in ${table}.${column} are not 0/1 and will coerce to "${falseValue}"`,
      { table, column, weirdCount, },
    );
  }

  const tempCol = `${column}_new`;

  // Whole conversion in one transaction (SAVEPOINT when nested in the
  // Migrator's transaction) — atomic on failure.
  await db.transaction().execute(async (trx,) => {
    // Add temp column with new type
    await trx.schema
      .alterTable(table,)
      .addColumn(tempCol, "text", (col,) => col.notNull().defaultTo(falseValue,),)
      .execute();

    // Copy data: 1 → trueValue, 0/null → falseValue
    await trx
      .updateTable(table,)
      .set({ [tempCol]: trueValue, },)
      .where(column, "=", 1,)
      .execute();

    // Drop index if it exists (SQLite requires index drop before column drop)
    if (options?.oldIndexName) {
      await trx.schema.dropIndex(options.oldIndexName,).ifExists().execute();
    }

    // Drop old column, rename temp
    await trx.schema.alterTable(table,).dropColumn(column,).execute();
    await trx.schema.alterTable(table,).renameColumn(tempCol, column,).execute();

    // Rebuild index if needed
    if (options?.oldIndexName && options?.indexColumns) {
      await trx.schema
        .createIndex(options.oldIndexName,)
        .on(table,)
        .columns(options.indexColumns,)
        .execute();
    }
  },);
}

/**
 * Convert multiple boolean integer columns to text enums in one call.
 * Each conversion is individually transactional — see {@link boolToEnum}.
 * @param db - Kysely instance
 * @param conversions - Array of conversion specs
 */
export async function batchBoolToEnum(
  db: Kysely<any>,
  conversions: {
    table: string;
    column: string;
    trueValue: string;
    falseValue: string;
    indexColumns?: string[];
    oldIndexName?: string;
  }[],
): Promise<void> {
  for (const conv of conversions) {
    await boolToEnum(db, conv.table, conv.column, conv.trueValue, conv.falseValue, {
      indexColumns: conv.indexColumns,
      oldIndexName: conv.oldIndexName,
    },);
  }
}
