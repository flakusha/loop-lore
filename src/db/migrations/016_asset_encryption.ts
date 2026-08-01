/**
 * Asset Encryption — DB Schema
 *
 * Adds encryption_tier and encrypted_key_id columns to assets table.
 * Assets inherit encryption tier from parent entity (chat/world/location).
 */
import type { Kysely, } from "kysely";

export async function up(db: Kysely<unknown>,): Promise<void> {
  // Add encryption tier column (default: 'public')
  await db.schema
    .alterTable("assets",)
    .addColumn("encryption_tier", "text", (col,) => col.notNull().defaultTo("public",),)
    .execute();

  // Add encrypted key ID column (nullable — only set when encrypted)
  await db.schema
    .alterTable("assets",)
    .addColumn("encrypted_key_id", "text",)
    .execute();

  // Add content hash column for idempotent upload detection (SHA-256 of raw buffer)
  await db.schema
    .alterTable("assets",)
    .addColumn("content_hash", "text",)
    .execute();
}

export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.alterTable("assets",).dropColumn("content_hash",).execute();
  await db.schema.alterTable("assets",).dropColumn("encrypted_key_id",).execute();
  await db.schema.alterTable("assets",).dropColumn("encryption_tier",).execute();
}
