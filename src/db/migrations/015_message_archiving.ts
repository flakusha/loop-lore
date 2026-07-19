import type { Kysely } from "kysely";

/**
 * Migration 015 — Message archiving
 *
 * Adds `archived_at` column to messages for soft-delete.
 * Messages are archived (hidden from normal view) but restorable
 * within 30 days. Permanent purge after 30 days.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .alterTable("messages")
    .addColumn("archived_at", "text")
    .execute();

  await database.schema
    .createIndex("idx_messages_archived")
    .on("messages")
    .column("archived_at")
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropIndex("idx_messages_archived").execute();

  await database.schema
    .alterTable("messages")
    .dropColumn("archived_at")
    .execute();
}
