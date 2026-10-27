// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * PRAGMA-driven survey of the foreign keys that point at `messages.id`.
 *
 * The archive purge must know every column that still references a message
 * before it deletes one: a `NO ACTION` foreign key aborts the whole delete
 * with a raw SQLite error. The survey used to be a hand-written list of two
 * columns (`messages.parent_id`, `chat_branches.parent_message_id`), which
 * missed every other referencing table.
 */

import { type Kysely, sql, } from "kysely";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";

/** A foreign key column that points at messages.id. */
export interface MessageForeignKey {
  table: string;
  column: string;
}

/**
 * Quote a SQLite identifier for interpolation into a statement.
 * @param name
 * @returns {string}
 */
function quoteIdentifier(name: string,): string {
  return `"${name.replace(/"/g, '""',)}"`;
}

/**
 * Every foreign key column that targets messages.id and whose delete action
 * blocks the delete. CASCADE removes the referencing rows and SET NULL clears
 * the reference, so neither of those stops a purge.
 * @param database The database handle to read the foreign keys with.
 * @param table The table to survey.
 * @returns The blocking foreign key columns.
 */
async function blockingMessageForeignKeysOf(database: Kysely<DB>, table: string,): Promise<MessageForeignKey[]> {
  // `pragma foreign_key_list` reports the REFERENCED table in its `table`
  // column and the referenced column in `to`; the referencing column is `from`
  // and the referencing table is the surveyed one.
  let fks: { table: string; from: string; to: string; on_delete: string }[];
  try {
    fks = (await sql<{ table: string; from: string; to: string; on_delete: string }>`
      pragma foreign_key_list(${sql.raw(quoteIdentifier(table,),)})
    `.execute(database,)).rows;
  } catch (error) {
    // A table whose foreign key list cannot be read is a virtual table: it
    // cannot hold a foreign key, so it cannot block a purge either.
    getLogger().warn("fk survey skipped a table", {
      table,
      message: error instanceof Error ? error.message : String(error,),
    },);

    return [];
  }

  const blocking: MessageForeignKey[] = [];
  for (const fk of fks) {
    if (fk.table !== "messages" || fk.to !== "id") { continue; }
    const action = fk.on_delete.toUpperCase();
    if (action === "CASCADE" || action === "SET NULL") { continue; }
    blocking.push({ table: table, column: fk.from, },);
  }

  return blocking;
}

/**
 * Every foreign key column of the database that targets messages.id and
 * whose delete action blocks the delete.
 * @param database The database handle to read the foreign keys with.
 * @returns The blocking foreign key columns.
 */
async function blockingMessageForeignKeys(database: Kysely<DB>,): Promise<MessageForeignKey[]> {
  const tables = (await sql<{ name: string }>`
    select name from sqlite_master where type = 'table' and name not like 'sqlite_%'
  `.execute(database,)).rows;

  const blocking: MessageForeignKey[] = [];
  for (const { name, } of tables) {
    blocking.push(...await blockingMessageForeignKeysOf(database, name,),);
  }

  return blocking;
}

/**
 * The candidate messages that a surviving row still references. Such a message
 * is structural: the purge keeps it (archived) instead of deleting it and
 * aborting the whole run.
 *
 * The survey is PRAGMA-driven, so it covers every FK column that targets
 * messages.id — generation_attempts, whitenotes, game_states, story_triggers
 * and conversation_merge among them.
 * @param database The database handle to read the references with.
 * @param candidateIds The messages the purge would delete.
 * @returns The blocked message ids.
 */
export async function structuralReferences(database: Kysely<DB>, candidateIds: string[],): Promise<Set<string>> {
  const blocked = new Set<string>();

  for (const fk of await blockingMessageForeignKeys(database,)) {
    const column = quoteIdentifier(fk.column,);
    const table = quoteIdentifier(fk.table,);
    // A referencing row survives the purge unless it is a message the purge
    // deletes itself (messages.parent_id - the leaf-first delete handles
    // those).
    const rows = fk.table === "messages"
      ? (await sql<{ value: string | null }>`
        select ${sql.raw(column,)} as value from ${sql.raw(table,)}
        where ${sql.raw(column,)} in (${sql.join(candidateIds,)}) and "id" not in (${sql.join(candidateIds,)})
      `.execute(database,)).rows
      : (await sql<{ value: string | null }>`
        select ${sql.raw(column,)} as value from ${sql.raw(table,)}
        where ${sql.raw(column,)} in (${sql.join(candidateIds,)})
      `.execute(database,)).rows;

    for (const row of rows) {
      if (row.value !== null) { blocked.add(row.value,); }
    }
  }

  return blocked;
}
