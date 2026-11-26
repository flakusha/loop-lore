// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Final-schema oracle for the `(chat_id, idempotency_key)` unique index.
 *
 * Before the constraint existed the route's findByIdempotencyKey pre-read was
 * the only dedupe, so two concurrent POSTs both inserted. The final schema
 * (005_chat) makes the DATABASE the arbiter via a partial unique index that
 * deliberately excludes `regen:variant:%` and `turn_skip:%` keys.
 *
 * The migration-time collapse of pre-existing duplicate groups is gone in the
 * consolidated chain; this file pins the constraint and its exclusions. It
 * lives in `src/db/` NOT `src/db/migrations/`: getMigrationFiles() would
 * register a colocated `NNN_*.test.ts` as a migration with undefined `up`.
 */
import { describe, expect, test, } from "bun:test";
import { type Kysely, sql, } from "kysely";

import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertChats, insertMessages, insertUsers, } from "../test-utils/insert-helpers";
import type { DB, } from "./schema";

const INDEX = "uq_messages_idempotency_enforced";

/**
 * @param db
 * @returns whether the unique index is present in the schema
 */
async function hasUniqueIndex(db: Kysely<DB>,): Promise<boolean> {
  const rows = await sql<{ name: string }>`
    SELECT name FROM sqlite_master WHERE type = 'index' AND name = ${INDEX}
  `.execute(db,);

  return rows.rows.length > 0;
}

/** One user, one actor, one chat — the FK chain a `messages` row needs. */
async function seed(db: Kysely<DB>,): Promise<{ chatId: string; actorId: string }> {
  const userId = await insertUsers(db, `idem-${crypto.randomUUID()}`, "Idem",);
  const actorId = await insertActors(db, "Idem Actor", { user_id: userId, },);
  const chatId = await insertChats(db, "Idem Chat", userId,);
  return { chatId, actorId, };
}

async function insertKeyed(
  db: Kysely<DB>,
  chatId: string,
  actorId: string,
  id: string,
  key: string,
  createdAt: string,
): Promise<void> {
  await insertMessages(db, chatId, actorId, "user", `body ${id}`, {
    id,
    idempotency_key: key,
    created_at: createdAt,
  },);
}

async function keyedIds(db: Kysely<DB>, chatId: string, key: string,): Promise<string[]> {
  const rows = await sql<{ id: string }>`
    SELECT id FROM messages WHERE chat_id = ${chatId} AND idempotency_key = ${key}
    ORDER BY created_at ASC, rowid ASC
  `.execute(db,);

  return rows.rows.map((r,) => r.id);
}

describe("messages idempotency unique (final schema)", () => {
  test("the unique index is present and rejects a racing duplicate key", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const { chatId, actorId, } = await seed(db,);
      expect(await hasUniqueIndex(db,),).toBe(true,);

      await insertKeyed(db, chatId, actorId, "first", "key-dup", "2026-01-01 00:00:00",);
      expect(await keyedIds(db, chatId, "key-dup",),).toEqual(["first",],);

      // The racing second POST now aborts at the database.
      await expect(
        insertKeyed(db, chatId, actorId, "dup-racing", "key-dup", "2026-01-02 00:00:00",),
      ).rejects.toThrow(/UNIQUE/i,);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  test("leaves the regen:variant and turn_skip families repeating and unconstrained", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const { chatId, actorId, } = await seed(db,);
      // The two families that legitimately REPEAT within one chat: pending
      // regen variants per (parent, style), and minute-bucket turn-skip keys.
      await insertKeyed(db, chatId, actorId, "regen-a", "regen:variant:p1:style1", "2026-01-01 00:00:00",);
      await insertKeyed(db, chatId, actorId, "regen-b", "regen:variant:p1:style1", "2026-01-02 00:00:00",);
      await insertKeyed(db, chatId, actorId, "skip-a", "turn_skip:bucket-1", "2026-01-01 00:00:00",);
      await insertKeyed(db, chatId, actorId, "skip-b", "turn_skip:bucket-2", "2026-01-02 00:00:00",);

      expect(await keyedIds(db, chatId, "regen:variant:p1:style1",),).toEqual(["regen-a", "regen-b",],);
      expect(await keyedIds(db, chatId, "turn_skip:bucket-1",),).toEqual(["skip-a",],);
      expect(await keyedIds(db, chatId, "turn_skip:bucket-2",),).toEqual(["skip-b",],);

      // The index keeps excluding them: a later same-key row still lands.
      await insertKeyed(db, chatId, actorId, "regen-c", "regen:variant:p1:style1", "2026-01-03 00:00:00",);
      await insertKeyed(db, chatId, actorId, "skip-c", "turn_skip:bucket-1", "2026-01-03 00:00:00",);
      expect(await keyedIds(db, chatId, "regen:variant:p1:style1",),).toEqual(["regen-a", "regen-b", "regen-c",],);
      expect(await keyedIds(db, chatId, "turn_skip:bucket-1",),).toEqual(["skip-a", "skip-c",],);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });
});
