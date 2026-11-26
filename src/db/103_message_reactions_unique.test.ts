// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Final-schema oracle for the `(message_id, user_id, emoji)` unique index on
 * `message_reactions` (owned by 005_chat in the consolidated chain).
 *
 * The toggle route was check-then-insert with no constraint on the triple, so
 * two concurrent POSTs both inserted and the grouped GET reported `count: 2`.
 * The final schema makes the DATABASE the arbiter; the migration-time collapse
 * of pre-existing duplicates is gone, so this file pins the constraint/scope.
 */
import { describe, expect, test, } from "bun:test";
import { type Kysely, sql, } from "kysely";

import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertMessageReactions,
  insertMessages,
  insertUsers,
} from "../test-utils/insert-helpers";
import { MessageRole, } from "./enums";
import type { DB, } from "./schema";

const UNIQUE_INDEX = "uq_message_reactions_message_user_emoji";

/**
 * @param db database handle
 * @param name index to look for
 * @returns whether that index is present in the schema
 */
async function hasIndex(db: Kysely<DB>, name: string,): Promise<boolean> {
  const rows = await sql<{ name: string }>`
    SELECT name FROM sqlite_master WHERE type = 'index' AND name = ${name}
  `.execute(db,);

  return rows.rows.length > 0;
}

/** Seed a user, a chat they own, and one message in it. */
async function seedMessage(db: Kysely<DB>,): Promise<{ userId: string; messageId: string }> {
  const userId = await insertUsers(db, `react-${crypto.randomUUID()}`, "React",);
  await insertActors(db, "reactor", {
    id: userId,
    actor_type: "user" as never,
    user_id: userId,
    owner_id: userId,
    agent_type: "none" as never,
    settings: "{}",
  },);

  const chatId = await insertChats(db, "Reaction Race", userId,);
  const messageId = await insertMessages(db, chatId, userId, MessageRole.User, "hello",);
  return { userId, messageId, };
}

describe("message_reactions unique (final schema)", () => {
  test("the unique index is present and rejects a racing duplicate reaction", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const { userId, messageId, } = await seedMessage(db,);
      expect(await hasIndex(db, UNIQUE_INDEX,),).toBe(true,);

      const firstId = await insertMessageReactions(db, messageId, userId, "👍", {
        created_at: "2026-01-01T00:00:00.000Z",
      },);

      // The racing second insert now aborts at the database.
      await expect(
        insertMessageReactions(db, messageId, userId, "👍",),
      ).rejects.toThrow(/UNIQUE/i,);

      const rows = await db
        .selectFrom("message_reactions",)
        .selectAll()
        .where("message_id", "=", messageId,)
        .where("user_id", "=", userId,)
        .where("emoji", "=", "👍",)
        .execute();

      expect(rows,).toHaveLength(1,);
      expect(rows[0]?.id,).toBe(firstId,);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  test("a different emoji from the same user is not a duplicate group", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const { userId, messageId, } = await seedMessage(db,);
      await insertMessageReactions(db, messageId, userId, "👍",);
      await insertMessageReactions(db, messageId, userId, "❤️",);

      const rows = await db
        .selectFrom("message_reactions",)
        .selectAll()
        .where("message_id", "=", messageId,)
        .where("user_id", "=", userId,)
        .execute();

      expect(rows,).toHaveLength(2,);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });
});
