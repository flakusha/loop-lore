// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 110_instance_storage_budgets_model_scope
 *
 * Widen the `asset_class` CHECK on `instance_storage_budgets` to admit
 * 'model' alongside the five 066 values. SQLite cannot ALTER a CHECK, so
 * the table is rebuilt column-for-column and every row copied unchanged;
 * the unique index and the eviction-policy CHECK are recreated identically.
 *
 * `down` restores the 066 constraint. A 'model' row cannot satisfy it, so
 * rollback throws rather than deleting data: drop model budgets first.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("instance_storage_budgets_new",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("asset_class", "text", (col,) => col.notNull().defaultTo("total",),)
    .addColumn("soft_limit_bytes", "integer",)
    .addColumn("hard_limit_bytes", "integer",)
    .addColumn("eviction_policy", "text", (col,) => col.notNull().defaultTo("none",),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addCheckConstraint(
      "ck_instance_storage_budgets_asset_class",
      sql`asset_class IN ('total','image','audio','video','model','other')`,
    )
    .addCheckConstraint("ck_instance_storage_budgets_eviction_policy", sql`eviction_policy IN ('none','oldest-first')`,)
    .execute();

  await sql`
    INSERT INTO instance_storage_budgets_new (
      id, asset_class, soft_limit_bytes, hard_limit_bytes, eviction_policy, updated_at
    )
    SELECT id, asset_class, soft_limit_bytes, hard_limit_bytes, eviction_policy, updated_at
    FROM instance_storage_budgets
  `.execute(database,);

  await database.schema.dropTable("instance_storage_budgets",).execute();
  await database.schema.alterTable("instance_storage_budgets_new",).renameTo("instance_storage_budgets",).execute();

  // Indexes are dropped with the old table; recreate the unique one.
  await database.schema
    .createIndex("uq_instance_storage_budgets_asset_class",)
    .on("instance_storage_budgets",)
    .column("asset_class",)
    .unique()
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  // The 066 CHECK has no 'model' value, so those rows cannot survive the
  // rebuild. Fail loudly rather than silently discarding them (the Kysely
  // migration transaction rolls the whole thing back).
  const modelRows = await sql<{ n: number }>`
    SELECT COUNT(*) AS n FROM instance_storage_budgets WHERE asset_class = 'model'
  `.execute(database,);

  if (Number(modelRows.rows[0]?.n ?? 0,) > 0) {
    throw new Error(
      "110_instance_storage_budgets_model_scope: cannot roll back while 'model' budget rows exist; delete them first",
    );
  }

  await database.schema
    .createTable("instance_storage_budgets_old",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("asset_class", "text", (col,) => col.notNull().defaultTo("total",),)
    .addColumn("soft_limit_bytes", "integer",)
    .addColumn("hard_limit_bytes", "integer",)
    .addColumn("eviction_policy", "text", (col,) => col.notNull().defaultTo("none",),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addCheckConstraint(
      "ck_instance_storage_budgets_asset_class",
      sql`asset_class IN ('total','image','audio','video','other')`,
    )
    .addCheckConstraint("ck_instance_storage_budgets_eviction_policy", sql`eviction_policy IN ('none','oldest-first')`,)
    .execute();

  await sql`
    INSERT INTO instance_storage_budgets_old (
      id, asset_class, soft_limit_bytes, hard_limit_bytes, eviction_policy, updated_at
    )
    SELECT id, asset_class, soft_limit_bytes, hard_limit_bytes, eviction_policy, updated_at
    FROM instance_storage_budgets
  `.execute(database,);

  await database.schema.dropTable("instance_storage_budgets",).execute();
  await database.schema.alterTable("instance_storage_budgets_old",).renameTo("instance_storage_budgets",).execute();

  await database.schema
    .createIndex("uq_instance_storage_budgets_asset_class",)
    .on("instance_storage_budgets",)
    .column("asset_class",)
    .unique()
    .execute();
}
