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

  // ── Response length control (FEAT-071) ──────────────────────
  await database.schema
    .alterTable("chats",)
    .addColumn("response_length_preset", "text", (col,) => col.notNull().defaultTo("medium",),)
    .execute();

  await database.schema
    .alterTable("chats",)
    .addColumn("response_length_custom", "integer",)
    .execute();

  // ── Per-chat context window override (FEAT-069) ─────────────
  await database.schema
    .alterTable("chats",)
    .addColumn("context_max_tokens", "integer",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  // Only drop columns added by this extension; encryption_level
  // was the original column (no down() in base migration 024).
  await database.schema.alterTable("chats",).dropColumn("context_max_tokens",).execute();
  await database.schema.alterTable("chats",).dropColumn("response_length_custom",).execute();
  await database.schema.alterTable("chats",).dropColumn("response_length_preset",).execute();
}
