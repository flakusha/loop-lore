// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 085_tool_call_audit
 *
 * Append-only audit trail for the assistant tool guard: one row per guarded
 * tool call — the tool, the caller, the guard's verdict, the judge's
 * rationale, the declared capabilities, and how long the call took.
 *
 * No FKs (mirrors immersion_decision_log): audit rows must survive chat or
 * user deletion so the trail stays complete.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("tool_call_audit",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("tool", "text", (col,) => col.notNull(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().defaultTo("",),)
    .addColumn("user_id", "text", (col,) => col.notNull().defaultTo("",),)
    .addColumn("verdict", "text", (col,) => col.notNull(),)
    .addColumn("rationale", "text", (col,) => col.notNull().defaultTo("",),)
    .addColumn("escalation_attempt", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("required_role", "text",)
    .addColumn("tags", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("duration_ms", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_tool_call_audit_chat_created",)
    .on("tool_call_audit",)
    .columns(["chat_id", "created_at",],)
    .execute();

  await database.schema
    .createIndex("idx_tool_call_audit_tool_created",)
    .on("tool_call_audit",)
    .columns(["tool", "created_at",],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  // SQLite DROP INDEX takes no ON clause (Kysely's `.on()` emits MySQL syntax).
  await database.schema.dropIndex("idx_tool_call_audit_tool_created",).execute();
  await database.schema.dropIndex("idx_tool_call_audit_chat_created",).execute();
  await database.schema.dropTable("tool_call_audit",).execute();
}
