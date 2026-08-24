// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for maybeAutoReply — specifically the swipe_index race fix
 * (.plan/tickets/BUG-chat-swipe-index-race.md).
 *
 * Concurrent `maybeAutoReply` calls against the same parent message must
 * produce distinct `swipe_index` values. Before the unique index
 * `idx_messages_swipe_unique` and the retry-on-conflict insert in
 * reply.ts, two concurrent replies could read the same MAX(swipe_index)
 * and race on INSERT, producing duplicate or lost swipes.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertMessages, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { maybeAutoReply, } from "./reply";

/**
 * Minimal Config that takes the synchronous rule-based assistant path
 * (LLM generation disabled, assistant enabled) and exercises the
 * swipe_index INSERT for every call.
 */
const testConfig = {
  assistant: { enabled: true, },
  encryption: { compressThreshold: 1024, compressAlgorithm: "gzip" as const, },
  generation: {
    providers: { openaiCompatible: [], },
    defaultProvider: null,
  },
} as unknown as Config;

describe("maybeAutoReply — swipe_index race", () => {
  let db: Kysely<DB>;
  let chatId: string;
  let actorId: string;
  let parentMessageId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    const userId = uid();
    await insertUsers(db, `user-${userId}`, "Test User", { id: userId, } as never,);
    actorId = userId;
    // messages.actor_id → actors.id; create the matching actor row.
    await db
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "user",
        display_name: "Test Actor",
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
    await insertChats(db, "Race Test Chat", actorId, { id: chatId, } as never,);

    parentMessageId = uid();
    await insertMessages(db, chatId, actorId, MessageRole.User, "hello world", {
      id: parentMessageId,
      swipe_index: 0,
    } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test(
    "concurrent maybeAutoReply calls produce distinct swipe_indexes for the same parent",
    async () => {
      const fanout = 8;
      const results = await Promise.all(
        Array.from({ length: fanout, }, () =>
          maybeAutoReply(
            db,
            testConfig,
            chatId,
            actorId,
            parentMessageId,
            "hello", // matches assistant "hello" keyword → generateResponse returns content
            new Request("http://localhost/",),
          ),),
      );

      // Every call should report a synchronous assistant reply.
      expect(results.every((r,) => r.replied),).toBe(true,);

      // Read back all swipe_indexes for this (chat, parent) — must be
      // a contiguous distinct sequence with no gaps and no duplicates.
      const swipes = await db
        .selectFrom("messages",)
        .select("swipe_index",)
        .where("chat_id", "=", chatId,)
        .where("parent_id", "=", parentMessageId,)
        .where("role", "=", MessageRole.Assistant,)
        .orderBy("swipe_index", "asc",)
        .execute();

      const indexes = swipes.map((r,) => r.swipe_index);
      expect(indexes,).toHaveLength(fanout,);
      expect(new Set(indexes,).size,).toBe(fanout,); // all distinct
      expect(indexes,).toEqual([1, 2, 3, 4, 5, 6, 7, 8,],); // contiguous
    },
  );
});
