// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 113_tooling_reports
 *
 * One categorized, queryable, deduped store for cross-source tooling-failure
 * reports (assistant | harness | giwt | check runner). RSI #20 (weekly
 * failure-cluster miner) consumes this table instead of log_entries: a
 * report whose `dedupe_key` matches an open cluster is UPSERTED — `count`
 * incremented, `last_seen` refreshed — so a persistent failure stays exactly
 * one row and its `count` is the repeat signal the miner thresholds on.
 *
 * - `source` / `category` / numeric ranges are CHECK-constrained (new table,
 *   so the constraints land in the CREATE TABLE — no trigger dance).
 * - Partial unique index: at most one open cluster per `dedupe_key`; NULL
 *   keys (ad-hoc one-shot reports) are never deduped.
 * - `instance_id` is stamped by the writer from `resolveInstanceSlug()` so a
 *   shared `LOOP_LORE_DB_PATH` never mixes instances on read; GET is always
 *   scoped to the caller's instance.
 * - No FKs (mirrors `tool_call_audit`): reports must survive entity deletion
 *   so the failure trail stays complete.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("tooling_reports",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("ts", "text", (col,) => col.notNull().defaultTo(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,),)
    .addColumn("source", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("tool", "text", (col,) => col.notNull().defaultTo("",),)
    .addColumn("attempt", "integer",)
    .addColumn("max_attempts", "integer",)
    .addColumn("detail", "text", (col,) => col.notNull().defaultTo("",),)
    .addColumn("duration_ms", "integer",)
    .addColumn("profile", "text",)
    .addColumn("branch", "text",)
    .addColumn("git_sha", "text",)
    .addColumn("instance_id", "text", (col,) => col.notNull().defaultTo("",),)
    .addColumn("dedupe_key", "text",)
    .addColumn("count", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("last_seen", "text",)
    .addCheckConstraint(
      "ck_tooling_reports_source",
      sql`source IN ('assistant', 'harness', 'giwt', 'check')`,
    )
    .addCheckConstraint(
      "ck_tooling_reports_category",
      sql`category IN ('tooling_failure', 'retry_exhausted', 'persistent_failure', 'performance')`,
    )
    .addCheckConstraint(
      "ck_tooling_reports_numerics",
      sql`(attempt IS NULL OR attempt >= 0) AND (max_attempts IS NULL OR max_attempts >= 0) AND (duration_ms IS NULL OR duration_ms >= 0)`,
    )
    .addCheckConstraint(
      "ck_tooling_reports_count",
      sql`count >= 1`,
    )
    .execute();

  // One open cluster per dedupe key, table-wide. The DB is per-instance in
  // practice; on a shared-LOOP_LORE_DB_PATH deployment identical keys still
  // collapse into one row instead of forking per instance.
  await sql`
    CREATE UNIQUE INDEX uq_tooling_reports_dedupe_key
    ON tooling_reports (dedupe_key)
    WHERE dedupe_key IS NOT NULL
  `.execute(database,);

  // The GET listing path: instance-scoped, newest first.
  await database.schema
    .createIndex("idx_tooling_reports_instance_ts",)
    .on("tooling_reports",)
    .columns(["instance_id", "ts",],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  // SQLite DROP INDEX takes no ON clause (Kysely's `.on()` emits MySQL syntax).
  await database.schema.dropIndex("idx_tooling_reports_instance_ts",).execute();
  await database.schema.dropIndex("uq_tooling_reports_dedupe_key",).execute();
  await database.schema.dropTable("tooling_reports",).execute();
}
