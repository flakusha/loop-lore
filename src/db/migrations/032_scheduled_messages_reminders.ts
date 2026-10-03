// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 032_scheduled_messages_reminders
 *
 * Messenger-parity composer cluster (TASK-scheduled-messages-reminders):
 *
 *   - `scheduled_messages` — a user's own message body parked for a future
 *     `send_at`. Dispatch is a cron pass that writes the row through the
 *     message write path; `status` moves pending → sent / canceled.
 *     Reminders are a separate table (a reminder is per (message, user), not
 *     per chat) so a user can be nudged about someone else's message.
 *
 * Append-only; lands as a forward migration after 031.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("scheduled_messages",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("author_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("body", "text", (col,) => col.notNull(),)
    .addColumn("send_at", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("pending",),)
    .execute();

  // Dispatcher scan: status = 'pending' AND send_at <= now, ordered by send_at.
  await sql`
      CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due
      ON scheduled_messages (status, send_at)
    `.execute(database,);

  await database.schema
    .createTable("message_reminders",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn(
      "message_id",
      "text",
      (col,) => col.notNull().references("messages.id",).onDelete("cascade",),
    )
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("remind_at", "text", (col,) => col.notNull(),)
    .execute();

  // Unique on (message_id, user_id) so a repeated create for the same pair
  // replaces rather than duplicates; the due scan rides its own index.
  await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_message_reminders_unique
      ON message_reminders (message_id, user_id)
    `.execute(database,);
  await sql`
      CREATE INDEX IF NOT EXISTS idx_message_reminders_due
      ON message_reminders (remind_at)
    `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_message_reminders_due`.execute(database,);
  await sql`DROP INDEX IF EXISTS idx_message_reminders_unique`.execute(database,);
  await database.schema.dropTable("message_reminders",).execute();

  await sql`DROP INDEX IF EXISTS idx_scheduled_messages_due`.execute(database,);
  await database.schema.dropTable("scheduled_messages",).execute();
}
