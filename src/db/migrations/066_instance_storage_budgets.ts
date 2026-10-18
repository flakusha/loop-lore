// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 066_instance_storage_budgets
 *
 * Per-instance (optionally per-asset-class) byte budgets for generated
 * assets, plus the opt-in eviction policy.
 *
 * Accounting source of truth is the DB — `assets.size_bytes` is NOT NULL and
 * open `mesh_reservations` rows hold inbound bytes — so this table stores
 * LIMITS only, never a running total. Reconciliation moves the observed
 * figure toward disk reality; it never writes a budget here.
 *
 * `asset_class = 'total'` is the instance-wide row; the other values mirror
 * `assets.asset_type` so a per-class budget is the same query with an extra
 * predicate. `eviction_policy` is opt-in: `'none'` means the soft limit warns
 * and the hard limit refuses, with nothing deleted.
 *
 * No FK by design — the row must survive user/asset churn, the same
 * rationale as `mesh_outbox` (038).
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("instance_storage_budgets",)
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

  await database.schema
    .createIndex("uq_instance_storage_budgets_asset_class",)
    .on("instance_storage_budgets",)
    .column("asset_class",)
    .unique()
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("uq_instance_storage_budgets_asset_class",).execute();
  await database.schema.dropTable("instance_storage_budgets",).execute();
}
