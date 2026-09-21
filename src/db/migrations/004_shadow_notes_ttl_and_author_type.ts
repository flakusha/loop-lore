// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 004_shadow_notes_ttl_and_author_type
 *
 * Add `expires_at` (TTL) and `author_type` columns to `shadow_notes`.
 *
 * - `expires_at` (text, ISO 8601, nullable) — when non-null, the row is
 *   past its sell-by date and should be filtered out of LLM injection by
 *   the fetch queries, then purged by a background sweep. Mirrors the
 *   `whitenotes.expires_at` column shape.
 * - `author_type` (text, nullable, defaults to "user") — who wrote the
 *   note. See `ShadowNoteAuthorType` in db/enums-gm.ts. Nullable for
 *   legacy rows written before this migration landed.
 *
 * Resolves: BUG-shadow-notes-table-missing-ttl-visibility-author-type-column
 *   (TTL + author_type; visibility was already resolved by 002.)
 *
 * Append-only; 001_init.ts is shipped.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  // SQLite only allows one column per ALTER TABLE.
  await database.schema
    .alterTable("shadow_notes",)
    .addColumn("expires_at", "text", (col,) => col,)
    .execute();
  await database.schema
    .alterTable("shadow_notes",)
    .addColumn(
      "author_type",
      "text",
      (col,) => col.notNull().defaultTo("user",),
    )
    .execute();

  // Lookup helper for the TTL purge sweep ("give me expired hidden notes").
  await sql`
      CREATE INDEX IF NOT EXISTS idx_shadow_notes_expires_at
      ON shadow_notes (expires_at)
      WHERE expires_at IS NOT NULL
    `.execute(database,);

  // Lookup helper for the LLM-injection gate ("give me authored-by-X notes").
  await sql`
      CREATE INDEX IF NOT EXISTS idx_shadow_notes_chat_author_type
      ON shadow_notes (chat_id, author_type)
    `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_shadow_notes_chat_author_type`.execute(
    database,
  );
  await sql`DROP INDEX IF EXISTS idx_shadow_notes_expires_at`.execute(
    database,
  );
  await database.schema
    .alterTable("shadow_notes",)
    .dropColumn("author_type",)
    .execute();
  await database.schema
    .alterTable("shadow_notes",)
    .dropColumn("expires_at",)
    .execute();
}
