// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 029_task_dependencies
 *
 * Dependency edges for the workflow DAG engine
 * (TASK-workflow-dag-engine-task-dependencies). One row per
 * "task A waits on task B" edge.
 *
 *   - `task_id`            — the node that is blocked.
 *   - `depends_on_task_id` — the node it waits for. Rows describe an
 *     execution edge `depends_on_task_id → task_id`.
 *   - `on_failure`         — what happens to `task_id` when
 *     `depends_on_task_id` ends non-done:
 *       `skip`  → the dependent is marked `skipped` (and, transitively,
 *                 its own `skip`-policy dependents too);
 *       `retry` → the dependent is left un-skipped, so a later pass can
 *                 pick it up once the failed node succeeds.
 *
 * Node ids are caller-supplied and opaque; there is no `task` table to
 * reference, so neither column is a foreign key. The composite PRIMARY
 * KEY makes an edge unique, and re-inserting an existing edge with a
 * different policy is an update rather than a duplicate-row error.
 *
 * Cycle prevention is NOT enforced here: SQLite CHECK cannot express
 * reachability, and the probe needs the same walk the engine does
 * anyway. `WorkflowDagEngine.addDependency` runs it and rejects the
 * insert (see `src/cron/dag/engine.ts`); that method is the only
 * sanctioned writer of this table.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("task_dependencies",)
    .addColumn("task_id", "text", (col,) => col.notNull(),)
    .addColumn("depends_on_task_id", "text", (col,) => col.notNull(),)
    .addColumn("on_failure", "text", (col,) => col.notNull().defaultTo("skip",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addPrimaryKeyConstraint("pk_task_dependencies", ["task_id", "depends_on_task_id",],)
    .addCheckConstraint("ck_task_dependencies_on_failure", sql`on_failure IN ('skip','retry')`,)
    // A node that waits on itself is the degenerate cycle. The engine
    // rejects it too, but this keeps the invariant true even for a raw
    // INSERT that bypasses the engine.
    .addCheckConstraint("ck_task_dependencies_not_self", sql`task_id <> depends_on_task_id`,)
    .execute();

  // Reverse lookup — "everything waiting on this node" — is the hot
  // direction: the engine reads it on every completion to propagate a
  // failure policy.
  await database.schema
    .createIndex("idx_task_dependencies_depends_on",)
    .on("task_dependencies",)
    .column("depends_on_task_id",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_task_dependencies_depends_on",).execute();
  await database.schema.dropTable("task_dependencies",).execute();
}
