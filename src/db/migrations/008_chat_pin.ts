import type { Kysely } from "kysely";

/**
 * Migration 008 — Chat pinning
 *
 * Adds `is_pinned` to `chats` so users can surface favorite chats in the
 * list. Integer flag (0/1) to match the existing boolean-as-number
 * convention used by `actor_notes.pinned` and `actor_items.equipped`.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .alterTable("chats")
    .addColumn("is_pinned", "integer", (col) => col.notNull().defaultTo(0))
    .execute();

  await database.schema.createIndex("idx_chats_pinned").on("chats").column("is_pinned").execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.alterTable("chats").dropColumn("is_pinned").execute();
}
