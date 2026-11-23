// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 008_mesh_federation — final-form consolidated baseline (S2).
 * Inline Kysely DSL only: the textual migration parser requires literal
 * createTable/addColumn calls inside up(). Raw SQL carries indexes,
 * triggers, FTS virtual tables and the remaining DML oracles.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("mesh_peers",)
    .addColumn("origin", "text", (col,) => col.primaryKey(),)
    .addColumn("state", "text", (col,) => col.defaultTo("pending",).notNull(),)
    .addColumn("capabilities", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("last_seen", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("capacity_bytes", "integer",)
    .addColumn("display_name", "text",)
    .addColumn("instance_kind", "text", (col,) => col.defaultTo("general",).notNull(),)
    .addColumn("auth_mode", "text", (col,) => col.defaultTo("tls",).notNull(),)
    .addColumn("workload_trust", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("allowed_workload_classes", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("sticky_enabled", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("shared_token_enc", "text",)
    .addColumn("key_version", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .execute();

  await database.schema
    .createTable("mesh_negotiations",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("peer_origin", "text", (col,) => col.notNull().references("mesh_peers.origin",).onDelete("cascade",),)
    .addColumn("state", "text", (col,) => col.defaultTo("idle",).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("mesh_reservations",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("peer_origin", "text", (col,) => col.notNull().references("mesh_peers.origin",).onDelete("cascade",),)
    .addColumn("content_hash", "text", (col,) => col.notNull(),)
    .addColumn("size_bytes", "integer", (col,) => col.notNull(),)
    .addColumn("content_type", "text", (col,) => col.defaultTo("blob",).notNull(),)
    .addColumn("state", "text", (col,) => col.defaultTo("reserved",).notNull(),)
    .addColumn("expires_at", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("mesh_deliveries",)
    .addColumn("content_id", "text", (col,) => col.primaryKey(),)
    .addColumn("origin", "text", (col,) => col.notNull(),)
    .addColumn("content_hash", "text", (col,) => col.notNull(),)
    .addColumn("clock", "integer", (col,) => col.notNull(),)
    .addColumn("received_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("mesh_inbound_keys",)
    .addColumn("peer_origin", "text", (col,) => col.primaryKey(),)
    .addColumn("encrypted_key", "text", (col,) => col.notNull(),)
    .addColumn("previous_encrypted_key", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("mesh_dek_exports",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull(),)
    .addColumn("key_id", "text", (col,) => col.notNull(),)
    .addColumn("peer_origin", "text", (col,) => col.notNull(),)
    .addColumn("sender_origin", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("revoked_at", "text",)
    .execute();

  await database.schema
    .createTable("mesh_outbox",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("target_origin", "text", (col,) => col.notNull(),)
    .addColumn("content_id", "text", (col,) => col.notNull(),)
    .addColumn("envelope", "text", (col,) => col.notNull(),)
    .addColumn("attempts", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("pending",).notNull(),)
    .addColumn("next_attempt_at", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("chat_id", "text",)
    .addCheckConstraint("ck_mesh_outbox_status", sql`status IN ('pending','done','dead')`,)
    .execute();

  await database.schema
    .createTable("mesh_work_assignments",)
    .addColumn("affinity_key", "text", (col,) => col.notNull(),)
    .addColumn("workload_class", "text", (col,) => col.notNull(),)
    .addColumn("peer_origin", "text", (col,) => col.notNull(),)
    .addColumn("assigned_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("previous_origin", "text",)
    .addColumn("released_at", "text",)
    .addColumn("release_reason", "text",)
    .addPrimaryKeyConstraint("mesh_work_assignments_pkey", ["affinity_key", "workload_class",],)
    .execute();

  await database.schema
    .createTable("federation_performance_budgets",)
    .addColumn("origin", "text", (col,) => col.notNull().references("mesh_peers.origin",).onDelete("cascade",),)
    .addColumn("workload_class", "text", (col,) => col.notNull(),)
    .addColumn("budget_mode", "text", (col,) => col.defaultTo("advisory",).notNull(),)
    .addColumn("max_concurrency", "integer",)
    .addColumn("max_queue_depth", "integer",)
    .addColumn("requests_per_minute", "integer",)
    .addColumn("tokens_per_minute", "integer",)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addPrimaryKeyConstraint("federation_performance_budgets_pk", ["origin", "workload_class",],)
    .execute();

  // raw index: idx_federation_performance_budgets_class
  await sql`CREATE INDEX "idx_federation_performance_budgets_class" on "federation_performance_budgets" ("workload_class")`
    .execute(database,);

  // raw index: idx_mesh_dek_exports_chat
  await sql`CREATE INDEX "idx_mesh_dek_exports_chat" on "mesh_dek_exports" ("chat_id")`.execute(database,);
  // raw index: idx_mesh_dek_exports_peer
  await sql`CREATE INDEX "idx_mesh_dek_exports_peer" on "mesh_dek_exports" ("peer_origin")`.execute(database,);
  // raw index: idx_mesh_outbox_due
  await sql`CREATE INDEX "idx_mesh_outbox_due" on "mesh_outbox" ("status", "next_attempt_at")`.execute(database,);
  // raw index: idx_mesh_work_assignments_peer
  await sql`CREATE INDEX "idx_mesh_work_assignments_peer" on "mesh_work_assignments" ("peer_origin")`.execute(
    database,
  );

  // raw index: uq_mesh_outbox_target_content
  await sql`CREATE UNIQUE INDEX "uq_mesh_outbox_target_content" on "mesh_outbox" ("target_origin", "content_id")`
    .execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("federation_performance_budgets",).execute();
  await database.schema.dropTable("mesh_work_assignments",).execute();
  await database.schema.dropTable("mesh_outbox",).execute();
  await database.schema.dropTable("mesh_dek_exports",).execute();
  await database.schema.dropTable("mesh_inbound_keys",).execute();
  await database.schema.dropTable("mesh_deliveries",).execute();
  await database.schema.dropTable("mesh_reservations",).execute();
  await database.schema.dropTable("mesh_negotiations",).execute();
  await database.schema.dropTable("mesh_peers",).execute();
}
