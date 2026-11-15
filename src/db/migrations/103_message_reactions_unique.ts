// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 103_message_reactions_unique
 *
 * `idx_reactions_message` / `idx_reactions_user` (001_init) are plain
 * non-unique indexes, so the toggle route's check-then-insert has a TOCTOU
 * window: two concurrent POSTs with the same (message, user, emoji) both
 * pass the lookup and both insert, leaving TWO rows for one reaction. The
 * grouped GET then reports `count: 2` for a single user's single reaction,
 * and the duplicate rows flow into the reaction grader's input.
 *
 * Adds `uq_message_reactions_message_user_emoji` (UNIQUE on all three
 * columns) and switches the toggle route's add path to INSERT ... ON
 * CONFLICT DO NOTHING (the poll-votes idiom in chat/service/polls.ts), so a
 * raced twin POST becomes a no-op instead of a second row. The two plain
 * indexes are kept — they serve the grouped-GET and per-user-DELETE lookups
 * and the append-only policy forbids rewriting 001.
 *
 * Defensive dedupe before the UNIQUE index is built (045/078/079
 * convention): a live database that already ran the racing insert path
 * holds duplicate groups, and CREATE UNIQUE INDEX aborts on them, leaving
 * the migration chain stuck. Duplicate reaction rows are always equivalent
 * (writers key on message+user+emoji, never on id), so the earliest row
 * survives and the rest are dropped with a warning.
 */
import { type Kysely, sql, } from "kysely";

interface DupRow {
  message_id: string;
  user_id: string;
  emoji: string;
  n: number;
}

interface RowId {
  id: string;
}

export async function up(database: Kysely<unknown>,): Promise<void> {
  const dups = await sql<DupRow>`
    SELECT message_id, user_id, emoji, COUNT(*) AS n
    FROM message_reactions
    GROUP BY message_id, user_id, emoji
    HAVING COUNT(*) > 1
  `.execute(database,);

  for (const dup of dups.rows) {
    process.emitWarning(
      `[103_message_reactions_unique] message ${dup.message_id} has ${dup.n} rows for user ${dup.user_id} emoji ${dup.emoji}; collapsing to oldest.`,
    );

    const survivor = await sql<RowId>`
      SELECT id FROM message_reactions
      WHERE message_id = ${dup.message_id} AND user_id = ${dup.user_id} AND emoji = ${dup.emoji}
      ORDER BY created_at ASC, rowid ASC
      LIMIT 1
    `.execute(database,);

    const survivorId = survivor.rows[0]?.id;
    if (!survivorId) { continue; }

    await sql`
      DELETE FROM message_reactions
      WHERE message_id = ${dup.message_id} AND user_id = ${dup.user_id} AND emoji = ${dup.emoji} AND id != ${survivorId}
    `.execute(database,);
  }

  await sql`
    CREATE UNIQUE INDEX uq_message_reactions_message_user_emoji
    ON message_reactions (message_id, user_id, emoji)
  `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`
    DROP INDEX IF EXISTS uq_message_reactions_message_user_emoji
  `.execute(database,);
}
