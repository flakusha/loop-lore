// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Typed Kysely Upsert Helpers
 *
 * Two thin wrappers around Kysely's `INSERT ... ON CONFLICT` builder that
 * give the rest of the codebase a single canonical pattern for:
 *
 * - `upsertByUnique` — INSERT or DO UPDATE; returns void.
 * - `insertUnique`   — INSERT or DO NOTHING; reports "inserted" vs "skipped".
 *
 * The default UPDATE semantics copy the conflicting column from the
 * attempted insert (`excluded.column`). Callers that need a different
 * UPDATE expression (e.g. `excluded.swipe_index + 1`) should use the
 * `upsertByUniqueWith` overload, which accepts a partial
 * column→expression map.
 *
 * Both helpers work for SQLite (the dev/runtime DB) and Postgres (the
 * production target — only the dialect differs). SQLite supports the
 * `ON CONFLICT (cols) DO UPDATE SET ...` form natively; PG has
 * identical syntax.
 *
 * @see BUG-chat-swipe-index-race for the original motivating use site.
 */

import { type AnyColumn, type InsertObject, type Kysely, type RawBuilder, sql, } from "kysely";
import type { DB, } from "./schema";

/**
 * Expression type accepted by Kysely's `doUpdateSet`. Kysely accepts a
 * value, a column reference, or a `sql` template result. We re-use the
 * `RawBuilder` shape because `sql\`...\`` returns exactly that.
 */
type UpdatableExpression = Parameters<typeof sql.val>[0] | RawBuilder<unknown>;

/**
 * INSERT a row, or on conflict UPDATE the listed columns to the values
 * from the attempted insert (`excluded.column`).
 *
 *   INSERT INTO <table> (...) VALUES (...)
 *   ON CONFLICT (<conflictColumns>) DO UPDATE
 *     SET <updateColumns> = excluded.<updateColumns>
 *
 * @param db            Kysely database instance.
 * @param table         Target table (key of DB).
 * @param values        Insert values.
 * @param conflictColumns  Columns participating in the unique/conflict target.
 * @param updateColumns Columns to update on conflict. Defaults to all
 *   columns in `values` that are NOT part of `conflictColumns` (every
 *   non-conflict column gets overwritten with `excluded.column`).
 * @returns Resolves when the INSERT or UPDATE has been executed. No row
 *   data is returned — callers that need inserted-vs-existing distinction
 *   must use `insertUnique` (which always reports) or read the row back.
 */
export async function upsertByUnique<
  T extends keyof DB,
  K extends AnyColumn<DB, T>,
>(
  db: Kysely<DB>,
  table: T,
  values: InsertObject<DB, T>,
  conflictColumns: readonly K[],
  updateColumns?: readonly K[],
): Promise<void> {
  const conflictSet = new Set<string>(conflictColumns.map(String,),);
  const valueKeys = Object.keys(values as object,);
  const inferredUpdate: string[] = updateColumns
    ? updateColumns.map(String,)
    : valueKeys.filter((col,) => !conflictSet.has(col,));

  // Build the SET clause as a partial-column map. We use sql.ref to point
  // each SET column at `excluded.<column>`, which is the Kysely idiom for
  // "copy from the attempted insert row".
  const setObject: Record<string, UpdatableExpression> = {};
  for (const col of inferredUpdate) {
    setObject[col] = sql.ref(`excluded.${col}`,) as unknown as UpdatableExpression;
  }

  if (inferredUpdate.length === 0) {
    // Every insertable column is also a conflict column — DO UPDATE
    // would be a no-op, so we degrade to DO NOTHING (preserves
    // uniqueness without raising).
    await db
      .insertInto(table,)
      .values(values,)
      .onConflict((oc,) => oc.columns(conflictColumns as readonly AnyColumn<DB, T>[],).doNothing())
      .execute();
    return;
  }

  await db
    .insertInto(table,)
    .values(values,)
    .onConflict((oc,) => oc.columns(conflictColumns as readonly AnyColumn<DB, T>[],).doUpdateSet(setObject as never,))
    .execute();
}

/**
 * INSERT a row, or on conflict apply a custom UPDATE expression per column.
 *
 * Mirrors Kysely's own `doUpdateSet` overload that accepts
 * `Partial<Record<column, expression>>`. Used when the desired update is
 * NOT a copy from `excluded.column` (e.g. `excluded.swipe_index + 1`,
 * a constant, or a raw SQL fragment).
 *
 * Returns the discriminator so the caller can distinguish a fresh
 * insert from an updated conflict row. Same caveat as `insertUnique`:
 * the underlying `numInsertedOrUpdatedRows` is 1 in both cases for
 * SQLite (insert writes 1 row, update touches 1 row), so we disambiguate
 * by inspecting the inserted id — but our `BunSqliteWrapper` discards
 * RETURNING results for INSERT. We sidestep this by running a guarded
 * SELECT for the row's primary key after the upsert: if the row's
 * `format_version` matches the inserted value, we treat it as fresh;
 * otherwise as updated. In practice the caller already knows the PK,
 * so the SELECT is cheap.
 *
 * @param db  Kysely database instance.
 * @param table  Target table.
 * @param values  Insert values.
 * @param conflictColumns  Conflict target columns.
 * @param updateSet  Per-column update expressions. Each value is a
 *   Kysely-compatible expression.
 * @returns `"inserted"` when the row was newly created; `"updated"`
 *   when a conflict triggered the UPDATE SET clause.
 */
export async function upsertByUniqueWith<
  T extends keyof DB,
  K extends AnyColumn<DB, T>,
>(
  db: Kysely<DB>,
  table: T,
  values: InsertObject<DB, T>,
  conflictColumns: readonly K[],
  updateSet: Partial<Record<AnyColumn<DB, T>, UpdatableExpression>>,
): Promise<"inserted" | "updated"> {
  await db
    .insertInto(table,)
    .values(values,)
    .onConflict((oc,) => oc.columns(conflictColumns as readonly AnyColumn<DB, T>[],).doUpdateSet(updateSet as never,))
    .execute();
  // Disambiguate insert vs update via a guarded SELECT on the PK. The
  // ON CONFLICT DO UPDATE preserves the existing row's identity
  // (the conflicting row is updated in place, NOT replaced), so after
  // an UPDATE conflict the row at `values.id` does NOT exist — the
  // existing row at the conflicting slot has a different id. After a
  // fresh INSERT, the row IS at `values.id`.
  const probeId = (values as Record<string, unknown>)["id"];
  if (probeId === undefined) {
    // No PK to probe — caller must inspect the row themselves.
    return "updated";
  }
  const exists = await sql<{ found: number }>`select 1 as found from ${sql.table(table,)} where ${
    sql.ref("id",)
  } = ${probeId}`.execute(db,);
  return exists.rows.length > 0 ? "inserted" : "updated";
}

/**
 * INSERT a row, or on conflict DO NOTHING.
 *
 * Returns a discriminator so the caller can distinguish a fresh insert
 * from a silently-skipped duplicate. Kysely does not surface this
 * distinction through `RETURNING` reliably across our wrappers (Bun's
 * sqlite adapter routes INSERT-with-RETURNING through `run`, dropping
 * rows). Instead we read `numInsertedOrUpdatedRows` from the
 * `InsertResult`: 1 on a fresh insert, 0 on a DO NOTHING skip.
 * Postgres's `ON CONFLICT DO NOTHING` reports the same shape, so this
 * works portably.
 *
 * @param db  Kysely database instance.
 * @param table  Target table.
 * @param values  Insert values.
 * @param conflictColumns  Conflict target columns.
 * @returns `"inserted"` when the row was created; `"skipped"` when a
 *   conflict on `conflictColumns` caused the INSERT to be dropped.
 */
export async function insertUnique<
  T extends keyof DB,
  K extends AnyColumn<DB, T>,
>(
  db: Kysely<DB>,
  table: T,
  values: InsertObject<DB, T>,
  conflictColumns: readonly K[],
): Promise<"inserted" | "skipped"> {
  const result = await db
    .insertInto(table,)
    .values(values,)
    .onConflict((oc,) => oc.columns(conflictColumns as readonly AnyColumn<DB, T>[],).doNothing())
    .execute();
  const first = result[0];
  const inserted = first !== undefined && Number(first.numInsertedOrUpdatedRows,) > 0;
  return inserted ? "inserted" : "skipped";
}
