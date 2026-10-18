// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 067_mesh_work_assignments
 *
 * The sticky-assignment table for peer workload routing
 * (TASK-federation-workload-routing-policy). One row per
 * `(affinity_key, workload_class)` — the current pin for a chat session to a
 * peer. `affinity_key` is a LOCAL opaque handle; it never leaves the sender.
 *
 * A release is RECORDED, never silent: when a pinned peer stops being
 * eligible (circuit open, trust revoked, class withdrawn) the row keeps the
 * peer it replaced plus when and why the pin was dropped, so a reassignment is
 * auditable from this table alone. `peer_origin` is always the CURRENT pin,
 * so "is this session pinned, and to whom" is one primary-key read.
 *
 * No FK to `mesh_peers`: a release must survive peer deletion — the audit of
 * "this peer was pinned here and dropped" outlives the row it names.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("mesh_work_assignments",)
    .addColumn("affinity_key", "text", (col,) => col.notNull(),)
    .addColumn("workload_class", "text", (col,) => col.notNull(),)
    .addColumn("peer_origin", "text", (col,) => col.notNull(),)
    .addColumn("assigned_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("previous_origin", "text",)
    .addColumn("released_at", "text",)
    .addColumn("release_reason", "text",)
    .addPrimaryKeyConstraint("mesh_work_assignments_pkey", ["affinity_key", "workload_class",],)
    .execute();

  await database.schema
    .createIndex("idx_mesh_work_assignments_peer",)
    .on("mesh_work_assignments",)
    .column("peer_origin",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_mesh_work_assignments_peer",).execute();
  await database.schema.dropTable("mesh_work_assignments",).execute();
}
