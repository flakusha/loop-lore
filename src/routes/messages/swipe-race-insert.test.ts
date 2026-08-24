// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for src/routes/messages/swipe-race-insert.ts.
 *
 * Covers .plan/tickets/BUG-chat-message-create-swipe-race.md and
 * .plan/tickets/BUG-chat-idempotency-not-enforced.md.
 *
 * - Concurrent user-message inserts at the same parent produce distinct
 *   swipe_indexes (retry-on-collision wraps SELECT-MAX + INSERT).
 * - findByIdempotencyKey short-circuits duplicate POSTs.
 * - Different chat_id with the same idempotency_key is independent.
 * - A null idempotency_key never triggers the idempotency short-circuit.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { MessageContentFormat, MessageContentType, MessageRole, MessageStatus, } from "../../db/enums";
import type { ContentEncoding, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertMessages, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import {
  findByIdempotencyKey,
  insertUserMessageWithRetry,
  SwipeInsertExhaustedError,
} from "./swipe-race-insert";

describe("swipe-race-insert — concurrent insert + retry", () => {
  let db: Kysely<DB>;
  let chatId: string;
  let actorId: string;
  let parentMessageId: string;

  beforeAll(async () => {
    ({ db, } = await createTestDb());

    const userId = uid();
    await insertUsers(db, `user-${userId}`, "Test User", { id: userId, } as never,);
    actorId = userId;
    // messages.actor_id → actors.id
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
    await insertMessages(db, chatId, actorId, MessageRole.User, "parent", {
      id: parentMessageId,
      swipe_index: 0,
    } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  const makeBase = (id: string,) => ({
    id,
    chatId,
    actorId,
    parentId: parentMessageId,
    storedContent: "x",
    storedKeyId: null as string | null,
    contentEncoding: "utf8" as ContentEncoding,
    idempotencyKey: null as string | null,
  });

  test("concurrent inserts at the same parent produce distinct swipe_indexes", async () => {
    const fanout = 8;
    const results = await Promise.all(
      Array.from({ length: fanout, }, () => insertUserMessageWithRetry(db, makeBase(uid(),),),),
    );

    expect(results,).toHaveLength(fanout,);
    const indexes = results.map((r,) => r.swipeIndex).sort((a, b,) => (a ?? 0) - (b ?? 0));
    // Each index must be unique and start at 1 (MAX(parent.swipe_index=0) + 1)
    expect(new Set(indexes,).size,).toBe(fanout,);
    expect(indexes[0],).toBe(1,);
    expect(indexes[fanout - 1],).toBe(fanout,);
  });

  test("parent-less insert leaves swipe_index null", async () => {
    const newChatId = uid();
    await insertChats(db, "Top-level Chat", actorId, { id: newChatId, } as never,);
    const result = await insertUserMessageWithRetry(db, {
      ...makeBase(uid(),),
      chatId: newChatId,
      parentId: null,
    },);
    expect(result.swipeIndex,).toBeNull();
  });

  test("exhausted retry throws SwipeInsertExhaustedError", async () => {
    // Force a collision by pre-inserting a row with swipe_index = MAX_INSEMPTS
    // so each retry attempt also collides. We use a stub id and let the
    // helper exhaust the loop on the unique index.
    const forcedChat = uid();
    await insertChats(db, "Exhaust Test Chat", actorId, { id: forcedChat, } as never,);
    const forcedParent = uid();
    await insertMessages(db, forcedChat, actorId, MessageRole.User, "p", {
      id: forcedParent,
      swipe_index: 0,
    } as never,);
    // Pre-fill swipe_indexes 1..MAX to collide every retry attempt.
    for (let i = 1; i <= 8; i++) {
      await db
        .insertInto("messages",)
        .values({
          id: uid(),
          chat_id: forcedChat,
          actor_id: actorId,
          parent_id: forcedParent,
          role: MessageRole.User,
          content: "blocked",
          content_format: MessageContentFormat.Markdown,
          content_type: MessageContentType.Text,
          content_encoding: "utf8" as ContentEncoding,
          status: MessageStatus.Confirmed,
          visibility: "visible",
          swipe_index: i,
        },)
        .execute();
    }
    // Now attempt an insert at swipe_index 9 — should also collide
    // because the helper computes MAX then +1, then retries incrementing
    // attempt counter only via the catch; since the underlying unique
    // index covers (chat_id, parent_id, swipe_index) but a NEW swipe_index
    // 9 is valid (no row at 9), this case actually succeeds. Adjust:
    // fill 9..16 too.
    for (let i = 9; i <= 16; i++) {
      await db
        .insertInto("messages",)
        .values({
          id: uid(),
          chat_id: forcedChat,
          actor_id: actorId,
          parent_id: forcedParent,
          role: MessageRole.User,
          content: "blocked",
          content_format: MessageContentFormat.Markdown,
          content_type: MessageContentType.Text,
          content_encoding: "utf8" as ContentEncoding,
          status: MessageStatus.Confirmed,
          visibility: "visible",
          swipe_index: i,
        },)
        .execute();
    }
    // Now MAX = 16, attempt 0 → swipe_index 17 → success.
    // To force exhaustion we need to inject a unique-index violation
    // independent of the swipe_index arithmetic. Use an explicit
    // duplicate id collision as the trigger.
    const dupId = uid();
    // Pre-insert with the same id to force the FIRST attempt to collide.
    await db
      .insertInto("messages",)
      .values({
        id: dupId,
        chat_id: forcedChat,
        actor_id: actorId,
        parent_id: null,
        role: MessageRole.User,
        content: "stub",
        content_format: MessageContentFormat.Markdown,
        content_type: MessageContentType.Text,
        content_encoding: "utf8" as ContentEncoding,
        status: MessageStatus.Confirmed,
        visibility: "visible",
        swipe_index: null,
      },)
      .execute();
    // Now insert with the same id (collides on primary key, retries
    // also collide because the helper re-uses the same id on every attempt).
    await expect(
      insertUserMessageWithRetry(db, {
        ...makeBase(dupId,),
        chatId: forcedChat,
        parentId: null,
      },),
    ).rejects.toBeInstanceOf(SwipeInsertExhaustedError,);
  });
});

describe("swipe-race-insert — idempotency", () => {
  let db: Kysely<DB>;
  let chatId: string;
  let otherChatId: string;
  let actorId: string;
  const idemKey = "unique-key-001";

  beforeAll(async () => {
    ({ db, } = await createTestDb());

    const userId = uid();
    await insertUsers(db, `idem-user-${userId}`, "Idem User", { id: userId, } as never,);
    actorId = userId;
    await db
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "user",
        display_name: "Idem Actor",
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
    otherChatId = uid();
    await insertChats(db, "Idem Chat", actorId, { id: chatId, } as never,);
    await insertChats(db, "Other Idem Chat", actorId, { id: otherChatId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("findByIdempotencyKey returns null when no row exists", async () => {
    const result = await findByIdempotencyKey(db, chatId, idemKey,);
    expect(result,).toBeNull();
  });

  test("after insert with idempotencyKey, findByIdempotencyKey returns that row's id", async () => {
    const rowId = uid();
    await insertUserMessageWithRetry(db, {
      id: rowId,
      chatId,
      actorId,
      parentId: null,
      storedContent: "x",
      storedKeyId: null,
      contentEncoding: "utf8" as ContentEncoding,
      idempotencyKey: idemKey,
    },);
    const result = await findByIdempotencyKey(db, chatId, idemKey,);
    expect(result,).toBe(rowId,);
  });

  test("same idempotencyKey on a different chat is independent", async () => {
    const result = await findByIdempotencyKey(db, otherChatId, idemKey,);
    expect(result,).toBeNull();
  });

  test("null idempotencyKey always returns null and never blocks inserts", async () => {
    const r1 = await findByIdempotencyKey(db, chatId, "",);
    const r2 = await findByIdempotencyKey(db, chatId, "",);
    expect(r1,).toBeNull();
    expect(r2,).toBeNull();
    // Two top-level inserts with no key — both succeed.
    const a = await insertUserMessageWithRetry(db, {
      id: uid(),
      chatId,
      actorId,
      parentId: null,
      storedContent: "a",
      storedKeyId: null,
      contentEncoding: "utf8" as ContentEncoding,
      idempotencyKey: null,
    },);
    const b = await insertUserMessageWithRetry(db, {
      id: uid(),
      chatId,
      actorId,
      parentId: null,
      storedContent: "b",
      storedKeyId: null,
      contentEncoding: "utf8" as ContentEncoding,
      idempotencyKey: null,
    },);
    expect(a.id,).not.toBe(b.id,);
  });
});
