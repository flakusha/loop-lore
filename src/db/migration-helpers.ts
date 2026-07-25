import type { Kysely, } from "kysely";

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
 * @param db - Kysely instance
 * @param table - Table name
 * @param column - Column to convert
 * @param trueValue - Text value when old value was 1 (e.g. "pinned")
 * @param falseValue - Text value when old value was 0 (e.g. "unpinned")
 * @param options - Optional: index rebuild config
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
  const tempCol = `${column}_new`;

  // Add temp column with new type
  await db.schema
    .alterTable(table,)
    .addColumn(tempCol, "text", (col,) => col.notNull().defaultTo(falseValue,),)
    .execute();

  // Copy data: 1 → trueValue, 0/null → falseValue
  await db
    .updateTable(table,)
    .set({ [tempCol]: trueValue, },)
    .where(column, "=", 1,)
    .execute();

  // Drop index if it exists (SQLite requires index drop before column drop)
  if (options?.oldIndexName) {
    await db.schema.dropIndex(options.oldIndexName,).ifExists().execute();
  }

  // Drop old column, rename temp
  await db.schema.alterTable(table,).dropColumn(column,).execute();
  await db.schema.alterTable(table,).renameColumn(tempCol, column,).execute();

  // Rebuild index if needed
  if (options?.oldIndexName && options?.indexColumns) {
    await db.schema
      .createIndex(options.oldIndexName,)
      .on(table,)
      .columns(options.indexColumns,)
      .execute();
  }
}

/**
 * Convert multiple boolean integer columns to text enums in one call.
 *
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
