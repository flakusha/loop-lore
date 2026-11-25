// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 018_harness_runs_calls — DB mirror of the append-only harness exec log.
 *
 * Iteration 2 of TASK-harness-db-tables: one row per harness run and one row
 * per call inside it, so JSONL lines become cross-searchable. Column shapes
 * follow request_results/telemetry_events (text timestamps, text status,
 * nullable cost/token metrics). `run_id`, `git_sha`, `command`, `model`,
 * `tokens_*`, `latency_ms` and `error_category` mirror the §11 epic contract;
 * the git sha is captured at dispatch, never derived by a git library.
 *
 * `cost_usd` NULL means "provider declares no price" and must never be
 * coalesced to 0 — the exec log treats unknown and free as different facts.
 */
import { type Kysely, sql, } from "kysely";

/** Terminal outcomes written to the exec log; no boolean status columns. */
const RESULT_VALUES = sql`'ok','error','timeout','cancelled'`;
/** Server-resolved principal kinds (src/middleware/principal-kind.ts). */
const PRINCIPAL_KIND_VALUES = sql`'user','internal-service','external-agent'`;

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("harness_runs",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("principal_id", "text",)
    .addColumn("principal_kind", "text",)
    .addColumn("status", "text", (col,) => col.defaultTo("ok",).notNull(),)
    .addColumn("task", "text", (col,) => col.notNull(),)
    .addColumn("task_type", "text", (col,) => col.notNull(),)
    .addColumn("command", "text",)
    .addColumn("model", "text",)
    .addColumn("git_sha", "text",)
    .addColumn("branch", "text",)
    .addColumn("turn_id", "text",)
    .addColumn("instance_id", "text",)
    .addColumn("error", "text",)
    .addColumn("error_category", "text",)
    .addColumn("tools", "text",)
    .addColumn("tool_count", "integer",)
    .addColumn("tokens_in", "integer",)
    .addColumn("tokens_out", "integer",)
    .addColumn("cost_usd", "real",)
    .addColumn("latency_ms", "integer",)
    .addColumn("started_at", "text", (col,) => col.notNull(),)
    .addColumn("ended_at", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addCheckConstraint("ck_harness_runs_status", sql`status IN (${RESULT_VALUES})`,)
    .addCheckConstraint(
      "ck_harness_runs_principal_kind",
      sql`principal_kind IN (${PRINCIPAL_KIND_VALUES})`,
    )
    .execute();

  await database.schema
    .createTable("harness_calls",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("run_id", "text", (col,) => col.notNull().references("harness_runs.id",),)
    .addColumn("principal_id", "text",)
    .addColumn("principal_kind", "text",)
    .addColumn("status", "text", (col,) => col.defaultTo("ok",).notNull(),)
    .addColumn("command", "text",)
    .addColumn("model", "text",)
    .addColumn("git_sha", "text",)
    .addColumn("turn_id", "text",)
    .addColumn("error", "text",)
    .addColumn("error_category", "text",)
    .addColumn("tokens_in", "integer",)
    .addColumn("tokens_out", "integer",)
    .addColumn("cost_usd", "real",)
    .addColumn("latency_ms", "integer",)
    .addColumn("started_at", "text", (col,) => col.notNull(),)
    .addColumn("ended_at", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addCheckConstraint("ck_harness_calls_status", sql`status IN (${RESULT_VALUES})`,)
    .addCheckConstraint(
      "ck_harness_calls_principal_kind",
      sql`principal_kind IN (${PRINCIPAL_KIND_VALUES})`,
    )
    .execute();

  // Every call lookup starts from its parent run; the FK alone does not index.
  await sql`CREATE INDEX "idx_harness_calls_run_id" on "harness_calls" ("run_id")`
    .execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("harness_calls",).execute();
  await database.schema.dropTable("harness_runs",).execute();
}
