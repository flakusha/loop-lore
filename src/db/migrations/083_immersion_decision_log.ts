// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 083_immersion_decision_log
 *
 * Append-only audit trail for the immersion consistency gate (WI-6): one
 * row per gate decision — input claims, actor state snapshot, verdict,
 * severity, and engine attribution. Written by the pre-generation seam,
 * the hook layer, and (later) the opt-in classifier via
 * `recordImmersionDecision`.
 *
 * No FKs (mirrors immersion_failed_checks): audit rows must survive chat
 * or actor deletion so the trail stays complete.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("immersion_decision_log",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("chat_id", "text", (col,) => col.notNull(),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("source", "text", (col,) => col.notNull().defaultTo("pregeneration",),)
    .addColumn("severity", "text", (col,) => col.notNull(),)
    .addColumn("rule_id", "text",)
    .addColumn("engine", "text", (col,) => col.notNull().defaultTo("deterministic",),)
    .addColumn("claims", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("state_snapshot", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("verdict", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_immersion_decision_log_chat_created",)
    .on("immersion_decision_log",)
    .columns(["chat_id", "created_at",],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  // SQLite DROP INDEX takes no ON clause (Kysely's `.on()` emits MySQL syntax).
  await database.schema.dropIndex("idx_immersion_decision_log_chat_created",).execute();
  await database.schema.dropTable("immersion_decision_log",).execute();
}
