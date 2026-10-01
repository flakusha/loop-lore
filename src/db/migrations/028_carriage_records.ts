// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 028_carriage_records
 *
 * Carriage channel: a dev/admin-visible record of cross-context state
 * carried between sections, parties, and sessions
 * (TASK-chat-feature-notes-shadow-carriage AC3). Rows are never exposed
 * through participant-facing routes; the only read path is the
 * admin-gated carriage endpoint.
 *
 * Append-only; lands as a forward migration after 027.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("carriage_records",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn(
      "chat_id",
      "text",
      (col,) => col.notNull().references("chats.id",).onDelete("cascade",),
    )
    // Deliberately no FK: the record must outlive a deleted source chat —
    // it is the remaining evidence that a carry happened.
    .addColumn("source_chat_id", "text",)
    .addColumn("scope", "text", (col,) => col.notNull(),)
    .addColumn("payload", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await sql`
      CREATE INDEX IF NOT EXISTS idx_carriage_records_chat_created
      ON carriage_records (chat_id, created_at)
    `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_carriage_records_chat_created`.execute(
    database,
  );
  await database.schema.dropTable("carriage_records",).execute();
}
