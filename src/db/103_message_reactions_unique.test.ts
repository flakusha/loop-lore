// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Migration 103 — UNIQUE index on
 * `message_reactions (message_id, user_id, emoji)`.
 *
 * The toggle route (`src/routes/message-reactions.ts`) was check-then-insert
 * with no constraint covering the triple, so two concurrent POSTs with the
 * same (message, user, emoji) both passed the lookup and both inserted —
 * TWO rows for one reaction, and the grouped GET reported `count: 2`. 103
 * makes the DATABASE the arbiter — and first collapses the duplicate
 * groups a raced database already accumulated, because CREATE UNIQUE INDEX
 * aborts on those and would leave the migration chain stuck half-applied.
 *
 * Mirrors src/db/079_actor_currencies_unique.test.ts and, like it, lives in
 * `src/db/` NOT `src/db/migrations/` (getMigrationFiles would register the
 * colocated test as a migration).
 */
import { describe, expect, test, } from "bun:test";
import { type Kysely, sql, } from "kysely";

import { captureWarnings, } from "../test-utils/capture-warnings";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertMessageReactions,
  insertMessages,
  insertUsers,
} from "../test-utils/insert-helpers";
import { MessageRole, } from "./enums";
import { down, up, } from "./migrations/103_message_reactions_unique";
import type { DB, } from "./schema";

const MIGRATION = "103_message_reactions_unique";
const UNIQUE_INDEX = "uq_message_reactions_message_user_emoji";

/** `up`/`down` are typed against the untyped handle the migrator passes them. */
type UntypedDb = Kysely<unknown>;

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

describe(MIGRATION, () => {
  test("collapses a duplicate reaction group to its oldest row, warns, then enforces the index", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const { userId, messageId, } = await seedMessage(db,);

      // The index exists already (103 ran in the chain) — drop it so the
      // duplicate rows can be inserted again.
      await down(db as unknown as UntypedDb,);
      expect(await hasIndex(db, UNIQUE_INDEX,),).toBe(false,);

      const firstId = await insertMessageReactions(db, messageId, userId, "👍", {
        created_at: "2026-01-01T00:00:00.000Z",
      },);

      await insertMessageReactions(db, messageId, userId, "👍", {
        created_at: "2026-01-02T00:00:00.000Z",
      },);

      const warnings = await captureWarnings(async () => {
        await up(db as unknown as UntypedDb,);
      }, new RegExp(`^\\[${MIGRATION}\\]`,),);

      expect(warnings,).toHaveLength(1,);
      expect(warnings[0],).toContain(MIGRATION,);
      expect(warnings[0],).toContain("collapsing to oldest",);

      const rows = await db
        .selectFrom("message_reactions",)
        .selectAll()
        .where("message_id", "=", messageId,)
        .where("user_id", "=", userId,)
        .where("emoji", "=", "👍",)
        .execute();

      expect(rows,).toHaveLength(1,);
      expect(rows[0]?.id,).toBe(firstId,);
      expect(await hasIndex(db, UNIQUE_INDEX,),).toBe(true,);

      // Enforced: the racing second insert now aborts at the database.
      await expect(
        insertMessageReactions(db, messageId, userId, "👍",),
      ).rejects.toThrow(/UNIQUE/i,);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  test("a different emoji from the same user is not a duplicate group", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const { userId, messageId, } = await seedMessage(db,);

      await down(db as unknown as UntypedDb,);
      await Promise.all([
        insertMessageReactions(db, messageId, userId, "👍",),
        insertMessageReactions(db, messageId, userId, "❤️",),
      ],);

      const warnings = await captureWarnings(async () => {
        await up(db as unknown as UntypedDb,);
      }, new RegExp(`^\\[${MIGRATION}\\]`,),);

      expect(warnings,).toEqual([],);
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
},);
