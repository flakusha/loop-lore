// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 045_messages_idempotency_unique
 *
 * `idx_messages_idempotency` (001_init) is a plain non-unique index on
 * `messages.idempotency_key`, so the route's check-then-insert has a TOCTOU
 * window: two concurrent POSTs with the same idempotencyKey both pass the
 * lookup, both insert (BUG-message-idempotency-key-dedup-not-db-enforced-concurrent-dup).
 *
 * Adds `uq_messages_idempotency_enforced`, a UNIQUE index on
 * `(chat_id, idempotency_key)` WHERE `idempotency_key` IS NOT NULL, and
 * excludes the two key families that legitimately REPEAT within one chat:
 *
 *  - `regen:variant:*` — pending variant rows carry the same key per
 *    (parent, style); the confirmed variant keeps the key for replay
 *    (chat/service/write.ts), so a later same-style regen re-inserts the key.
 *  - `turn_skip:*` — minute-bucket dedup keys (chat/service/crud/turn-skip.ts)
 *    collide across buckets; dedup there is the latest-message guard.
 *
 * The plain `idx_messages_idempotency` index stays: it still serves the
 * `findByIdempotencyKey` lookup (route short-circuit + scheduled dispatcher)
 * with a WHERE-NULLS-free range scan, and the append-only policy forbids
 * rewriting 001.
 *
 * SQLite note: `NULL` idempotency_key rows are never constrained by a UNIQUE
 * index, and the WHERE clause keeps NULLs and the repeating key families out
 * entirely.
 */
import { type Kysely, sql, } from "kysely";

interface DupRow {
  chat_id: string;
  idempotency_key: string;
  n: number;
}

interface RowId {
  id: string;
}

export async function up(database: Kysely<unknown>,): Promise<void> {
  // Defensive dedupe: if pre-existing data already holds concurrent-duplicate
  // rows (the very bug this closes), collapse them to the oldest row before
  // the UNIQUE index is built — otherwise index creation fails and the
  // migration chain is stuck. Warns so operators notice collapsed history.
  const dups = await sql<DupRow>`
    SELECT chat_id, idempotency_key, COUNT(*) AS n
    FROM messages
    WHERE idempotency_key IS NOT NULL
      AND idempotency_key NOT LIKE 'regen:variant:%'
      AND idempotency_key NOT LIKE 'turn_skip:%'
    GROUP BY chat_id, idempotency_key
    HAVING COUNT(*) > 1
  `.execute(database,);

  for (const dup of dups.rows) {
    process.emitWarning(
      `[045_messages_idempotency_unique] chat ${dup.chat_id} has ${dup.n} rows sharing idempotency_key; collapsing to oldest.`,
    );

    const survivor = await sql<RowId>`
      SELECT id FROM messages
      WHERE chat_id = ${dup.chat_id} AND idempotency_key = ${dup.idempotency_key}
      ORDER BY created_at ASC, rowid ASC
      LIMIT 1
    `.execute(database,);

    const survivorId = survivor.rows[0]?.id;
    if (!survivorId) { continue; }

    await sql`
      DELETE FROM messages
      WHERE chat_id = ${dup.chat_id} AND idempotency_key = ${dup.idempotency_key} AND id != ${survivorId}
    `.execute(database,);
  }

  await sql`
    CREATE UNIQUE INDEX uq_messages_idempotency_enforced
    ON messages (chat_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL
      AND idempotency_key NOT LIKE 'regen:variant:%'
      AND idempotency_key NOT LIKE 'turn_skip:%'
  `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`
    DROP INDEX IF EXISTS uq_messages_idempotency_enforced
  `.execute(database,);
}
