// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 002_shadow_notes_visibility
 *
 * Add a `visibility` column to `shadow_notes` independent of the existing
 * `status` (user-reveal) flag. The spec §Shadow Note Rules treats visibility
 * as the LLM-injection gate, while status continues to control player-reveal.
 *
 * Resolves:
 *   - BUG-shadow-notes-missing-visibility-for-llm-injection-control
 *   - partial resolution for BUG-shadow-notes-table-missing-ttl-visibility-author-type-column
 *     (visibility only — TTL/author_type remain to be added by future tickets
 *     since they need broader spec sign-off and downstream consumer changes)
 *
 * Append-only; 001_init.ts is shipped, so this lands as a forward migration.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  // SQLite only allows one column per ALTER TABLE.
  await database.schema
    .alterTable("shadow_notes",)
    .addColumn(
      "visibility",
      "text",
      (col,) => col.notNull().defaultTo("user_visible"),
    )
    .execute();

  // Lookup helper for the LLM-injection gate: "give me hidden notes for this chat".
  await sql`
      CREATE INDEX IF NOT EXISTS idx_shadow_notes_chat_visibility
      ON shadow_notes (chat_id, visibility)
    `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_shadow_notes_chat_visibility`.execute(
    database,
  );
  await database.schema
    .alterTable("shadow_notes",)
    .dropColumn("visibility",)
    .execute();
}
