// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for storeMessage (src/generation/auto-gen/store-message.ts).
 *
 * Covers:
 * - Happy path without parent: row persisted, swipe_index null, no transform.
 * - With parentMessageId: swipe index computed as max+1.
 * - Swipe UNIQUE race: a one-shot trigger aborts the first INSERT with a
 *   swipe-UNIQUE-style error; storeMessage must bump the candidate and
 *   retry inside the same transaction, then succeed.
 * - Non-UNIQUE errors (FK violation on a missing parent) are rethrown.
 *
 * Parallel-safe: fresh in-memory DB per test, unique ids, no ordering
 * dependence. The race trigger is created/dropped inside the test DB only
 * (no migration mutation).
 */
import type { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Config, } from "../../config/schema";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import type { GenDeps, } from "./deps";
import { storeMessage, type StoreMessageOpts, } from "./store-message";

/**
 * GenDeps stub: no encryption (getSmk → null), pass-through encryptAtRest.
 */
function makeDeps(): GenDeps {
  return {
    getSmk: () => null,
    getChatEncryptionLevel: async () => "none" as never,
    encryptAtRest: async (opts: { plaintext: string },) => ({
      storedContent: opts.plaintext,
      keyId: null,
      wasEncrypted: false,
    }),
  } as unknown as GenDeps;
}

function makeOpts(db: Kysely<DB>, overrides: Partial<StoreMessageOpts>,): StoreMessageOpts {
  return {
    d: makeDeps(),
    database: db,
    config: {
      encryption: { compressThreshold: 1, compressAlgorithm: "gzip", },
    } as unknown as Config,
    chatId: "chat-1",
    actorId: "actor-1",
    parentMessageId: null,
    content: "hello world",
    resolved: { resolvedModel: "test-model", resolvedProviderName: "test-provider", },
    tokenUsage: { promptTokens: 1, completionTokens: 2, totalTokens: 3, },
    dominantEmotion: undefined,
    thinking: undefined,
    ...overrides,
  };
}

describe("storeMessage", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeEach(async () => {
    const created = await createTestDb();
    db = created.db;
    sqlite = created.sqlite;
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  async function seedChat(chatId: string,): Promise<void> {
    const userId = await insertUsers(db, `u-${chatId}`, "User", { id: `user-${chatId}`, },);
    await insertActors(db, "Actor", { id: `actor-${chatId}`, user_id: userId, },);
    await insertChats(db, "Chat", userId, { id: chatId, },);
  }

  test("happy path without parent persists message with null swipe index", async () => {
    await seedChat("chat-1",);

    const result = await storeMessage(
      makeOpts(db, { chatId: "chat-1", actorId: "actor-chat-1", content: "plain content", },),
    );

    expect(result.transformed,).toBe(false,);
    const row = await db
      .selectFrom("messages",)
      .selectAll()
      .where("id", "=", result.messageId,)
      .executeTakeFirstOrThrow();
    expect(row.content,).toBe("plain content",);
    expect(row.role,).toBe(MessageRole.Assistant,);
    expect(row.parent_id,).toBeNull();
    expect(row.swipe_index,).toBeNull();
  });

  test("with parent computes swipe_index as max+1", async () => {
    await seedChat("chat-2",);
    const parentId = await insertMessages(
      db,
      "chat-2",
      "actor-chat-2",
      MessageRole.Assistant,
      "parent",
      { id: "parent-2", parent_id: null, swipe_index: null, },
    );

    const result = await storeMessage(
      makeOpts(db, {
        chatId: "chat-2",
        actorId: "actor-chat-2",
        parentMessageId: parentId,
        content: "swiped reply",
      },),
    );

    const row = await db
      .selectFrom("messages",)
      .selectAll()
      .where("id", "=", result.messageId,)
      .executeTakeFirstOrThrow();
    expect(row.parent_id,).toBe(parentId,);
    expect(row.swipe_index,).toBe(1,);
  });

  test("swipe UNIQUE race bumps candidate and retries to success", async () => {
    await seedChat("chat-3",);
    const parentId = await insertMessages(
      db,
      "chat-3",
      "actor-chat-3",
      MessageRole.Assistant,
      "parent",
      { id: "parent-3", parent_id: null, swipe_index: null, },
    );

    // One-shot trigger: abort the FIRST insert into messages with a
    // swipe-UNIQUE-style error message (the regex storeMessage matches on),
    // simulating a concurrent winner of the swipe race. The retried insert
    // passes because the flag row flips on first fire.
    sqlite.run("CREATE TABLE race_trigger_flag (fired INTEGER)",);
    sqlite.run("INSERT INTO race_trigger_flag VALUES (0)",);
    sqlite.run(
      "CREATE TRIGGER race_swipe_once BEFORE INSERT ON messages WHEN ((SELECT fired FROM race_trigger_flag) = 0) BEGIN UPDATE race_trigger_flag SET fired = 1; SELECT RAISE(FAIL, 'UNIQUE constraint failed: messages.chat_id, messages.parent_id, messages.swipe_index'); END",
    );

    try {
      const result = await storeMessage(
        makeOpts(db, {
          chatId: "chat-3",
          actorId: "actor-chat-3",
          parentMessageId: parentId,
          content: "raced reply",
        },),
      );

      const row = await db
        .selectFrom("messages",)
        .selectAll()
        .where("id", "=", result.messageId,)
        .executeTakeFirstOrThrow();
      // Both attempts used candidate max+1 = 1 (the aborted insert never
      // committed), so the successful row lands on swipe_index 1.
      expect(row.parent_id,).toBe(parentId,);
      expect(row.swipe_index,).toBe(1,);
      expect(row.content,).toBe("raced reply",);
    } finally {
      sqlite.run("DROP TRIGGER race_swipe_once",);
      sqlite.run("DROP TABLE race_trigger_flag",);
    }
  });

  test("non-UNIQUE insert error is rethrown, not retried", async () => {
    await seedChat("chat-4",);
    // parent_id points at a nonexistent message row → FK violation on
    // insert. storeMessage must surface it (no swipe-race retry masking).
    await expect(
      storeMessage(
        makeOpts(db, {
          chatId: "chat-4",
          actorId: "actor-chat-4",
          parentMessageId: "msg-does-not-exist",
          content: "orphan reply",
        },),
      ),
    ).rejects.toThrow();
    const rows = await db
      .selectFrom("messages",)
      .selectAll()
      .where("chat_id", "=", "chat-4",)
      .where("content", "=", "orphan reply",)
      .execute();
    expect(rows.length,).toBe(0,);
  });
});
