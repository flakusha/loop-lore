// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * FTS5 lifecycle tests for the `messages.content_plaintext` shadow column
 * added by migration 068 and maintained by the `messages_fts_ai` /
 * `messages_fts_au` / `messages_fts_ad` triggers.
 *
 * Covers:
 *  - BUG-chat-fts-encrypt-mismatch (ciphertext no longer pollutes the index)
 *  - BUG-chat-message-update-no-fts-refresh (PATCH re-tokenizes)
 *  - BUG-chat-message-delete-soft-fails-compliance (hard DELETE purges FTS)
 *
 * Tests use the direct `messages` table + raw FTS queries so we exercise
 * the trigger behavior rather than the route layer (which is already
 * covered by integration tests in messages/create.test.ts and friends).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { type Kysely, sql, } from "kysely";
import { MessageContentFormat, MessageContentType, MessageRole, MessageStatus, } from "../../../db/enums";
import type { ContentEncoding, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertChats, insertMessages, insertUsers, } from "../../../test-utils/insert-helpers";
import { uid, } from "../../../utils";
import { insertUserMessageWithRetry, } from "../swipe-race-insert";

describe("FTS lifecycle on messages.content_plaintext (migration 068)", () => {
  let db: Kysely<DB>;
  let chatId: string;
  let actorId: string;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    const userId = uid();
    await insertUsers(db, `user-${userId}`, "FTS Test", { id: userId, } as never,);
    actorId = userId;
    await db
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "user",
        display_name: "FTS Actor",
        user_id: userId,
        owner_id: userId,
        agent_type: "none",
        settings: "{}",
        format_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();
    chatId = uid();
    await insertChats(db, "FTS Test Chat", actorId, { id: chatId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  /**
   * Look up a row in the FTS5 virtual table by message_id.
   * @param messageId
   */
  const ftsContentFor = async (messageId: string,): Promise<string | null> => {
    const row = await sql<{ content: string }>`
      SELECT content FROM messages_fts WHERE message_id = ${messageId}
    `.execute(db,);
    return row.rows[0]?.content ?? null;
  };

  test("insertUserMessageWithRetry writes content + content_plaintext; FTS row carries plaintext", async () => {
    const id = uid();
    const plaintext = "alpha bravo charlie";
    await insertUserMessageWithRetry(db, {
      id,
      chatId,
      actorId,
      parentId: null,
      storedContent: "CIPHERTEXT_PLACEHOLDER", // simulate ciphertext
      storedKeyId: "key-001",
      storedPlaintext: plaintext,
      contentEncoding: "utf8" as ContentEncoding,
      idempotencyKey: null,
    },);

    // 1. Row exists with both columns.
    const row = await db
      .selectFrom("messages",)
      .select(["content", "content_plaintext",],)
      .where("id", "=", id,)
      .executeTakeFirstOrThrow();
    expect(row.content,).toBe("CIPHERTEXT_PLACEHOLDER",);
    expect(row.content_plaintext,).toBe(plaintext,);

    // 2. FTS row indexed the plaintext, NOT the ciphertext.
    const fts = await ftsContentFor(id,);
    expect(fts,).toBe(plaintext,);
  });

  test("UPDATE content_plaintext on existing row re-tokenizes FTS row", async () => {
    const id = uid();
    await insertUserMessageWithRetry(db, {
      id,
      chatId,
      actorId,
      parentId: null,
      storedContent: "CIPHERTEXT",
      storedKeyId: "key-002",
      storedPlaintext: "original token",
      contentEncoding: "utf8" as ContentEncoding,
      idempotencyKey: null,
    },);
    expect(await ftsContentFor(id,),).toBe("original token",);

    // PATCH /messages/:id rewrites both content and content_plaintext.
    await db
      .updateTable("messages",)
      .set({ content_plaintext: "edited token", },)
      .where("id", "=", id,)
      .execute();

    expect(await ftsContentFor(id,),).toBe("edited token",);
  });

  test("UPDATE that touches only content does NOT churn the FTS index", async () => {
    // Sanity: the trigger only fires on UPDATE OF content_plaintext. A bare
    // content rewrite (e.g. tier-rotation metadata) leaves the FTS row
    // intact.
    const id = uid();
    await insertUserMessageWithRetry(db, {
      id,
      chatId,
      actorId,
      parentId: null,
      storedContent: "CIPHERTEXT_A",
      storedKeyId: "key-003",
      storedPlaintext: "stable token",
      contentEncoding: "utf8" as ContentEncoding,
      idempotencyKey: null,
    },);

    await db
      .updateTable("messages",)
      .set({ content: "CIPHERTEXT_B", },) // tier rotation; no plaintext change
      .where("id", "=", id,)
      .execute();

    expect(await ftsContentFor(id,),).toBe("stable token",);
  });

  test("real DELETE from messages fires messages_fts_ad and removes the FTS row", async () => {
    const id = uid();
    await insertUserMessageWithRetry(db, {
      id,
      chatId,
      actorId,
      parentId: null,
      storedContent: "CIPHERTEXT",
      storedKeyId: "key-004",
      storedPlaintext: "doomed token",
      contentEncoding: "utf8" as ContentEncoding,
      idempotencyKey: null,
    },);
    expect(await ftsContentFor(id,),).toBe("doomed token",);

    await db.deleteFrom("messages",).where("id", "=", id,).execute();

    // Trigger must have removed the FTS row.
    expect(await ftsContentFor(id,),).toBeNull();
  });

  test("FTS MATCH against a word from a plaintext message finds that message_id", async () => {
    // End-to-end assertion: a FTS MATCH query over the catalog finds the
    // message we inserted via the helper, even though `messages.content`
    // holds ciphertext.
    const id = uid();
    await insertUserMessageWithRetry(db, {
      id,
      chatId,
      actorId,
      parentId: null,
      storedContent: "CIPHERTEXT_UNIQUE_WORD_SENTINEL",
      storedKeyId: "key-005",
      storedPlaintext: "needle knoxneedle haystack",
      contentEncoding: "utf8" as ContentEncoding,
      idempotencyKey: null,
    },);

    // `knoxneedle` is a token unique enough to not collide with any other
    // row in the test DB.
    const hits = await sql<{ message_id: string }>`
      SELECT message_id FROM messages_fts WHERE messages_fts MATCH 'knoxneedle'
    `.execute(db,);
    const ids = hits.rows.map((row,) => row.message_id);
    expect(ids,).toContain(id,);
    // No hit against the ciphertext sentinel — the trigger no longer
    // touches `messages.content` for FTS purposes.
    expect(ids,).not.toContain("CIPHERTEXT_UNIQUE_WORD_SENTINEL",);
  });

  test("client-pre-encrypted payload: content_plaintext is null and the FTS row is empty (no hits)", async () => {
    // Regression for the silent-omission case: when we never saw plaintext
    // (client pre-encrypted payload), the FTS row tokenizes an empty
    // string — no false hits.
    const id = uid();
    await insertUserMessageWithRetry(db, {
      id,
      chatId,
      actorId,
      parentId: null,
      storedContent: "OPAQUE_CIPHERTEXT",
      storedKeyId: "key-006",
      storedPlaintext: null,
      contentEncoding: "utf8" as ContentEncoding,
      idempotencyKey: null,
    },);

    const row = await db
      .selectFrom("messages",)
      .select(["content_plaintext",],)
      .where("id", "=", id,)
      .executeTakeFirstOrThrow();
    expect(row.content_plaintext,).toBeNull();

    // MATCH on a token only present in the ciphertext must NOT find this
    // row — the index no longer touches `messages.content` at all.
    const hits = await sql<{ message_id: string }>`
      SELECT message_id FROM messages_fts WHERE messages_fts MATCH 'OPAQUE_CIPHERTEXT'
    `.execute(db,);
    const ids = hits.rows.map((r,) => r.message_id);
    expect(ids,).not.toContain(id,);
  });
});

// Smoke-check that the production insert path also runs through the trigger
// (touching the existing insertMessages helper) — confirms the migration
// `messages_fts_ai` body matches `new.content_plaintext`, not `new.content`.
describe("insertMessages helper (used by tests + migrateChat carry) writes content_plaintext", () => {
  let db: Kysely<DB>;
  let chatId: string;
  let actorId: string;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    const userId = uid();
    await insertUsers(db, `user-${userId}`, "Carry FTS", { id: userId, } as never,);
    actorId = userId;
    await db
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "user",
        display_name: "Carry Actor",
        user_id: userId,
        owner_id: userId,
        agent_type: "none",
        settings: "{}",
        format_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();
    chatId = uid();
    await insertChats(db, "Carry FTS Chat", actorId, { id: chatId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("insertMessages with content_plaintext sets both columns and indexes FTS", async () => {
    const id = uid();
    await insertMessages(db, chatId, actorId, MessageRole.User, "raw content for ssl test", {
      id,
      swipe_index: 0,
      content_format: MessageContentFormat.Markdown,
      content_type: MessageContentType.Text,
      content_encoding: "utf8" as ContentEncoding,
      status: MessageStatus.Confirmed,
      content_plaintext: "ssl fingerprint marker",
    } as never,);

    const row = await db
      .selectFrom("messages",)
      .select(["content", "content_plaintext",],)
      .where("id", "=", id,)
      .executeTakeFirstOrThrow();
    expect(row.content,).toBe("raw content for ssl test",);
    expect(row.content_plaintext,).toBe("ssl fingerprint marker",);

    // FTS row tokenizes the plaintext column, NOT the default content.
    const fts = await sql<{ content: string }>`
      SELECT content FROM messages_fts WHERE message_id = ${id}
    `.execute(db,);
    expect(fts.rows[0]?.content,).toBe("ssl fingerprint marker",);
  });
});
