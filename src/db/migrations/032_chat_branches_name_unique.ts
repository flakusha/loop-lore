// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 032_chat_branches_name_unique
 *
 * Makes `chat_branches (chat_id, name)` unique so the DATABASE — not an
 * unlocked pre-read — arbitrates a branch label. 013 declared `name` as a bare
 * `text notNull`, and `nextAutoName` derived "Branch N" from an unlocked
 * `SELECT COUNT(*)`, so two concurrent forks in one chat both computed the same
 * name and both inserts succeeded.
 *
 * A plain UNIQUE index is enough here: unlike the asset dedup key (030) or the
 * per-actor story points (020), `name` is NOT NULL, so SQLite's NULL-distinct
 * rule never applies to this pair.
 *
 * Defensive dedupe: a database that already ran the racing insert path holds
 * same-named siblings, and `CREATE UNIQUE INDEX` aborts on those, leaving the
 * migration stuck half-applied. Duplicates are RENAMED, not deleted — a branch
 * row is a user-visible fork point, so dropping one would silently remove a
 * branch the user can see. The oldest row keeps the name.
 *
 * Append-only policy (`src/db/migrations/README.md`): a forward schema change,
 * not a rewrite of 013.
 */
import { type Kysely, sql, } from "kysely";

/**
 * True when `name` is already used by a branch row in `chatId`.
 * @param database
 * @param chatId
 * @param name
 * @returns {Promise<boolean>}
 */
async function nameTaken(
  database: Kysely<unknown>,
  chatId: string,
  name: string,
): Promise<boolean> {
  const taken = await sql<{ n: number }>`
    SELECT COUNT(*) AS n FROM chat_branches WHERE chat_id = ${chatId} AND name = ${name}
  `.execute(database,);
  return Number(taken.rows[0]?.n ?? 0,) > 0;
}

export async function up(database: Kysely<unknown>,): Promise<void> {
  const dupes = await sql<{ chat_id: string; name: string; n: number }>`
    SELECT chat_id, name, COUNT(*) AS n
    FROM chat_branches
    GROUP BY chat_id, name
    HAVING COUNT(*) > 1
  `.execute(database,);

  for (const dupe of dupes.rows) {
    // BUG-migration-032-logs-via-console-warn-with-eslint-disable: process.emitWarning
    // is the repo's warning channel (migrations 020, 030);
    // console.warn would need an eslint-disable and bypasses the structured sink.
    process.emitWarning(
      `[032_chat_branches_name_unique] chat ${dupe.chat_id} has ${dupe.n} branches named "${dupe.name}"; renaming all but the oldest.`,
    );
    const rows = await sql<{ id: string }>`
      SELECT id FROM chat_branches
      WHERE chat_id = ${dupe.chat_id} AND name = ${dupe.name}
      ORDER BY created_at ASC, id ASC
    `.execute(database,);
    // `rows.rows[0]` is the oldest and keeps the name; the rest are renamed.
    for (const [index, row,] of rows.rows.slice(1,).entries()) {
      let suffix = index + 2;
      let candidate = `${dupe.name} (${suffix})`;
      while (await nameTaken(database, dupe.chat_id, candidate,)) {
        suffix += 1;
        candidate = `${dupe.name} (${suffix})`;
      }
      await sql`
        UPDATE chat_branches SET name = ${candidate} WHERE id = ${row.id}
      `.execute(database,);
    }
  }

  await database.schema
    .createIndex("uq_chat_branches_chat_name",)
    .on("chat_branches",)
    .columns(["chat_id", "name",],)
    .unique()
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("uq_chat_branches_chat_name",).execute();
}
