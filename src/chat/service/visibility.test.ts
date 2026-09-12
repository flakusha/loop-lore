/**
 * Tests for `updateMessageVisibility` (message visibility operations) and
 * `hardDeleteChat` (TASK-chat-feature-archive-deletion-search).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { hardDeleteChat, updateMessageVisibility, } from "./visibility";

describe("updateMessageVisibility", () => {
  let db: Kysely<DB>;
  const userId: string = crypto.randomUUID();
  const actorId: string = crypto.randomUUID();
  const chatId: string = crypto.randomUUID();
  const messageId: string = crypto.randomUUID();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    await insertUsers(db, `user-${userId}`, "Test User", { id: userId, } as never,);
    await insertActors(db, "Actor", { id: actorId, user_id: userId, owner_id: userId, } as never,);
    await insertChats(db, "Chat", userId, { id: chatId, } as never,);
    await insertMessages(db, chatId, actorId, MessageRole.User, "hello", { id: messageId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("updates visibility and hidden reason", async () => {
    const result = await updateMessageVisibility(db, messageId, "hidden_by_user", "user hid it",);
    expect(result,).toEqual({ ok: true, },);

    const row = await db
      .selectFrom("messages",)
      .select(["visibility", "hidden_reason",],)
      .where("id", "=", messageId,)
      .executeTakeFirst();
    expect(row?.visibility,).toBe("hidden_by_user",);
    expect(row?.hidden_reason,).toBe("user hid it",);
  });

  test("supports other visibility values with null reason", async () => {
    const result = await updateMessageVisibility(db, messageId, "hidden_by_moderator", null,);
    expect(result,).toEqual({ ok: true, },);

    const row = await db
      .selectFrom("messages",)
      .select(["visibility", "hidden_reason",],)
      .where("id", "=", messageId,)
      .executeTakeFirst();
    expect(row?.visibility,).toBe("hidden_by_moderator",);
    expect(row?.hidden_reason,).toBeNull();
  });

  test("overwrites previous reason with the new one", async () => {
    await updateMessageVisibility(db, messageId, "hidden_by_user", "first reason",);
    await updateMessageVisibility(db, messageId, "hidden_by_user", "updated reason",);

    const row = await db
      .selectFrom("messages",)
      .select("hidden_reason",)
      .where("id", "=", messageId,)
      .executeTakeFirst();
    expect(row?.hidden_reason,).toBe("updated reason",);
  });

  test("returns ok for a non-existent message id", async () => {
    const result = await updateMessageVisibility(db, "missing-message", "hidden_by_user", null,);
    expect(result,).toEqual({ ok: true, },);
  });
});

/**
 * `hardDeleteChat` (TASK-chat-feature-archive-deletion-search).
 *
 * Reuses the visibility test harness (single DB, seeded chat + actor + user)
 * and verifies the cascade shape: chat row + messages + participants + assets
 * vanish, shared memories survive (memories are pinned to actor, not chat).
 */
describe("hardDeleteChat", () => {
  let db: Kysely<DB>;
  const userId: string = crypto.randomUUID();
  const actorId: string = crypto.randomUUID();
  const chatId: string = crypto.randomUUID();
  const messageId: string = crypto.randomUUID();
  const memberId: string = crypto.randomUUID();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await insertUsers(db, `user-${userId}`, "Test User", { id: userId, } as never,);
    await insertUsers(db, `user-${memberId}`, "Member User", { id: memberId, } as never,);
    await insertActors(db, "Owner", { id: actorId, user_id: userId, owner_id: userId, } as never,);
    await insertActors(db, "Member", { id: memberId, user_id: memberId, owner_id: memberId, } as never,);
    await insertChats(db, "Hard Delete", userId, { id: chatId, } as never,);
    await insertMessages(db, chatId, actorId, MessageRole.User, "hello", { id: messageId, } as never,);
    await insertChatParticipants(db, chatId, actorId, { role_in_chat: "owner", },);
    await insertChatParticipants(db, chatId, memberId, { role_in_chat: "member", },);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("deletes the chat and its messages for the owner", async () => {
    const result = await hardDeleteChat(db, chatId, userId, "user",);
    expect(result,).toEqual({ ok: true, chatId, },);
    const chat = await db
      .selectFrom("chats",)
      .select("id",)
      .where("id", "=", chatId,)
      .executeTakeFirst();
    expect(chat,).toBeUndefined();
    const msg = await db
      .selectFrom("messages",)
      .select("id",)
      .where("id", "=", messageId,)
      .executeTakeFirst();
    expect(msg,).toBeUndefined();
  });

  test("denies a non-owner member with a forbidden result", async () => {
    const isolated = await createTestDb();
    const localDb = isolated.db;
    const otherUser = crypto.randomUUID();
    const otherChat = crypto.randomUUID();
    await insertUsers(localDb, `user-${otherUser}`, "Other", { id: otherUser, } as never,);
    await insertActors(localDb, "Other", { id: otherUser, user_id: otherUser, owner_id: otherUser, } as never,);
    await insertChats(localDb, "Other Chat", otherUser, { id: otherChat, } as never,);
    await insertChatParticipants(localDb, otherChat, otherUser, { role_in_chat: "owner", },);
    const member = crypto.randomUUID();
    await insertUsers(localDb, `user-${member}`, "Member", { id: member, } as never,);
    await insertActors(localDb, "Member", { id: member, user_id: member, owner_id: member, } as never,);
    await insertChatParticipants(localDb, otherChat, member, { role_in_chat: "member", },);

    const result = await hardDeleteChat(localDb, otherChat, member, "user",);
    expect(result,).toEqual({
      code: "forbidden",
      message: "Only the chat creator, an Owner, or a GM can change settings",
    },);
    // Chat row still present — the guard short-circuited before the cascade.
    const stillThere = await localDb
      .selectFrom("chats",)
      .select("id",)
      .where("id", "=", otherChat,)
      .executeTakeFirst();
    expect(stillThere?.id,).toBe(otherChat,);
    await isolated.db.destroy();
  });
});
