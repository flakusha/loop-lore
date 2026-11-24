// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * CG-18: generated assistant messages must be findable by the default keyword
 * tier. FTS5 indexes `messages.content_plaintext`, so the assistant writer
 * has to persist that mirror alongside the (possibly encrypted) content.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { type Kysely, sql, } from "kysely";
import { randomUUID, } from "node:crypto";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChats, insertMessages, insertUsers, } from "../../test-utils/insert-helpers";
import { buildGenerationResult, storeGenerationResult, } from "./persist";

describe("generated assistant messages are searchable", () => {
  let db: Kysely<DB>;

  beforeEach(async () => {
    ({ db, } = await createTestDb());
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  test("storeGenerationResult persists the plaintext mirror so FTS MATCH finds the row", async () => {
    const suffix = randomUUID().replaceAll("-", "",);
    const token = `cg18${suffix}`;
    const content = `The watchword is ${token}.`;

    const userId = await insertUsers(db, `u-${suffix}`, "User",);
    const actorId = await insertActors(db, "Actor", {
      id: `actor-${suffix}`,
      user_id: userId,
    },);

    const chatId = await insertChats(db, "Chat", userId, { id: `chat-${suffix}`, },);
    const parentId = await insertMessages(db, chatId, actorId, MessageRole.User, "prompt",);

    const messageId = await storeGenerationResult({
      db,
      attemptId: `attempt-${suffix}`,
      result: buildGenerationResult({
        content,
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3, },
      }, false,),
      chatId,
      parentMessageId: parentId,
      actorId,
      modelId: "test-model",
      provider: "test-provider",
    },);

    const row = await db
      .selectFrom("messages",)
      .select("content_plaintext",)
      .where("id", "=", messageId,)
      .executeTakeFirstOrThrow();

    expect(row.content_plaintext,).toBe(content,);

    const match = await sql<{ message_id: string }>`
      SELECT message_id FROM messages_fts WHERE messages_fts MATCH ${token}
    `.execute(db,);

    expect(match.rows.map((r,) => r.message_id),).toContain(messageId,);

    // The smart-regen fill UPDATEs the same row: changing content without the
    // mirror would leave the FTS row stuck on the old text.
    const newToken = `cg18regen${suffix}`;
    await storeGenerationResult({
      db,
      attemptId: `attempt-regen-${suffix}`,
      result: buildGenerationResult({
        content: `The watchword is ${newToken}.`,
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3, },
      }, false,),
      chatId,
      parentMessageId: parentId,
      actorId,
      modelId: "test-model",
      provider: "test-provider",
      targetMessageId: messageId,
    },);

    const refreshed = await sql<{ message_id: string }>`
      SELECT message_id FROM messages_fts WHERE messages_fts MATCH ${newToken}
    `.execute(db,);

    expect(refreshed.rows.map((r,) => r.message_id),).toContain(messageId,);
    const stale = await sql<{ message_id: string }>`
      SELECT message_id FROM messages_fts WHERE messages_fts MATCH ${token}
    `.execute(db,);

    expect(stale.rows.map((r,) => r.message_id),).not.toContain(messageId,);
  });
});
