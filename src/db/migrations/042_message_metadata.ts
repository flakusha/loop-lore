/**
 * Migration 042: Add metadata column to messages table
 *
 * Adds a JSON metadata column for storing movement events and other
 * structured data alongside messages. Backward compatible — defaults to null.
 */
import type { Kysely, } from "kysely";

export async function up(db: Kysely<unknown>,): Promise<void> {
  // Add metadata column to messages table
  await db.schema
    .alterTable("messages",)
    .addColumn("metadata", "text",)
    .execute();
}

export async function down(db: Kysely<unknown>,): Promise<void> {
  // Remove metadata column
  await db.schema
    .alterTable("messages",)
    .dropColumn("metadata",)
    .execute();
}
