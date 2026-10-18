// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 068_federation_performance_budgets
 *
 * The operator-set performance budget for one `(peer, workloadClass)` cell:
 * `max_concurrency`, `max_queue_depth`, `requests_per_minute` and the
 * ADVISORY `tokens_per_minute`, plus the `budget_mode` that decides whether
 * the numbers are enforced or merely counted.
 *
 * Budgets are configuration, so they live in the DB next to the peer registry
 * and survive a restart. The COUNTERS that read them do not: they are
 * in-process (`src/federation/performance-quota.ts`), so a restarted instance
 * is permissive for one window. That asymmetry is deliberate — a DB counter
 * would need a cross-instance reservation to be atomic, which is consensus and
 * out of scope.
 *
 * Every numeric budget is nullable and `NULL` means UNLIMITED, matching the
 * epic's "unset means unlimited" default. A new peer therefore needs no row at
 * all; when a row exists it defaults to `advisory`, the epic's default mode for
 * a newly added peer.
 *
 * `tokens_per_minute` is stored beside the enforced budgets so the usage
 * report can compare against it — it is never enforced, because tokens are
 * unknown until a generation is already paid for.
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("federation_performance_budgets",)
    .addColumn(
      "origin",
      "text",
      (col,) => col.notNull().references("mesh_peers.origin",).onDelete("cascade",),
    )
    .addColumn("workload_class", "text", (col,) => col.notNull(),)
    .addColumn("budget_mode", "text", (col,) => col.notNull().defaultTo("advisory",),)
    .addColumn("max_concurrency", "integer",)
    .addColumn("max_queue_depth", "integer",)
    .addColumn("requests_per_minute", "integer",)
    .addColumn("tokens_per_minute", "integer",)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addPrimaryKeyConstraint(
      "federation_performance_budgets_pk",
      ["origin", "workload_class",],
    )
    .execute();

  await database.schema
    .createIndex("idx_federation_performance_budgets_class",)
    .on("federation_performance_budgets",)
    .column("workload_class",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("federation_performance_budgets",).execute();
}
