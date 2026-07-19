import type { Kysely, } from "kysely";

/**
 * Migration 024 — Add encryption_level to chats
 *
 * Adds the `encryption_level` column to `chats` with a default of `'public'`.
 * This column is immutable once set (enforced in application code).
 *
 * Encryption tiers:
 *   - `public`   — plaintext storage, accessible without auth for public pages
 *   - `standard` — server-mediated AES-256-GCM via chat keys (current pipeline)
 *   - `private`  — end-to-end, server never sees plaintext
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("chats",)
    .addColumn("encryption_level", "text", (col,) => col.notNull().defaultTo("public",),)
    .execute();
}
