// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 038_mesh_outbox
 *
 * Sender-side retry queue for failed federation pushes
 * (BUG-federation-delivery-reliability-queue-retry-idempotency-unde):
 * fan-out records one row per (target, content) whose push failed, and the
 * `federation.outbox-drain` cron retries with exponential backoff until the
 * content is delivered (`done`) or attempts are exhausted (`dead`). The
 * envelope is stored exactly as `pushEnvelope` sends it (sealed JSON), so a
 * retry re-pushes identical bytes; receiver-side LWW dedup keeps retries
 * idempotent. No FKs by design: rows must survive peer-registry churn.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("mesh_outbox",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("target_origin", "text", (col,) => col.notNull(),)
    .addColumn("content_id", "text", (col,) => col.notNull(),)
    .addColumn("envelope", "text", (col,) => col.notNull(),)
    .addColumn("attempts", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("pending",),)
    .addColumn("next_attempt_at", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addCheckConstraint("ck_mesh_outbox_status", sql`status IN ('pending','done','dead')`,)
    .execute();

  // Upsert dedup key for the fan-out failure path (ON CONFLICT target).
  await database.schema
    .createIndex("uq_mesh_outbox_target_content",)
    .on("mesh_outbox",)
    .columns(["target_origin", "content_id",],)
    .unique()
    .execute();

  await database.schema
    .createIndex("idx_mesh_outbox_due",)
    .on("mesh_outbox",)
    .columns(["status", "next_attempt_at",],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_mesh_outbox_due",).execute();
  await database.schema.dropIndex("uq_mesh_outbox_target_content",).execute();
  await database.schema.dropTable("mesh_outbox",).execute();
}
