// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for chat archive / unarchive service operations
 * (TASK-chat-feature-archive-deletion-search).
 *
 * Covers:
 *  - archiveChat flips is_pinned to "archived"
 *  - unarchiveChat restores is_pinned to "unpinned"
 *  - both operations enforce the settings-access guard
 *  - isChatArchived is a pure read returning the live state
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { PinnedState, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../../test-utils/insert-helpers";
import { archiveChat, isChatArchived, unarchiveChat, } from "./archive";

describe("chat archive service", () => {
  let db: Kysely<DB>;
  const ownerId: string = crypto.randomUUID();
  const memberId: string = crypto.randomUUID();
  const chatId: string = crypto.randomUUID();

  beforeEach(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: ownerId, } as never,);
    await insertUsers(db, "member", "Member", { id: memberId, } as never,);
    await insertActors(db, "Owner", {
      id: ownerId,
      user_id: ownerId,
      owner_id: ownerId,
    } as never,);
    await insertActors(db, "Member", {
      id: memberId,
      user_id: memberId,
      owner_id: memberId,
    } as never,);
    await insertChats(db, "Archive Me", ownerId, { id: chatId, } as never,);
    await insertChatParticipants(db, chatId, ownerId, { role_in_chat: "owner", },);
    await insertChatParticipants(db, chatId, memberId, { role_in_chat: "member", },);
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  test("archiveChat flips is_pinned to 'archived'", async () => {
    const result = await archiveChat(db, chatId, ownerId, "user",);
    expect(result,).toEqual({ ok: true, chatId, },);
    const row = await db
      .selectFrom("chats",)
      .select("is_pinned",)
      .where("id", "=", chatId,)
      .executeTakeFirst();
    expect(row?.is_pinned,).toBe(PinnedState.Archived,);
  });

  test("archiveChat is idempotent on already-archived chats", async () => {
    await archiveChat(db, chatId, ownerId, "user",);
    // Second call returns ok:true without throwing — the WHERE clause
    // filters out the already-archived row.
    const result = await archiveChat(db, chatId, ownerId, "user",);
    expect(result,).toEqual({ ok: true, chatId, },);
    expect(await isChatArchived(db, chatId,),).toBe(true,);
  });

  test("unarchiveChat restores is_pinned to 'unpinned'", async () => {
    await archiveChat(db, chatId, ownerId, "user",);
    const result = await unarchiveChat(db, chatId, ownerId, "user",);
    expect(result,).toEqual({ ok: true, chatId, },);
    const row = await db
      .selectFrom("chats",)
      .select("is_pinned",)
      .where("id", "=", chatId,)
      .executeTakeFirst();
    expect(row?.is_pinned,).toBe(PinnedState.Unpinned,);
  });

  test("unarchiveChat on a non-archived chat is a no-op", async () => {
    const result = await unarchiveChat(db, chatId, ownerId, "user",);
    expect(result,).toEqual({ ok: true, chatId, },);
    const row = await db
      .selectFrom("chats",)
      .select("is_pinned",)
      .where("id", "=", chatId,)
      .executeTakeFirst();
    expect(row?.is_pinned,).toBe(PinnedState.Unpinned,);
  });

  test("archiveChat denies a non-owner member", async () => {
    const result = await archiveChat(db, chatId, memberId, "user",);
    expect(result,).toEqual({
      code: "forbidden",
      message: "Only the chat creator or an Owner role can change settings",
    },);
    expect(await isChatArchived(db, chatId,),).toBe(false,);
  });

  test("archiveChat allows an admin (admin.chat capability) bypassing the owner check", async () => {
    const adminId: string = crypto.randomUUID();
    await insertUsers(db, "admin", "Admin", { id: adminId, role: "admin" as never, } as never,);
    const result = await archiveChat(db, chatId, adminId, "admin",);
    expect(result,).toEqual({ ok: true, chatId, },);
    expect(await isChatArchived(db, chatId,),).toBe(true,);
  });

  test("isChatArchived returns false for a non-existent chat", async () => {
    expect(await isChatArchived(db, "missing-id",),).toBe(false,);
  });

  test("isChatArchived reflects the live archive flag", async () => {
    expect(await isChatArchived(db, chatId,),).toBe(false,);
    await archiveChat(db, chatId, ownerId, "user",);
    expect(await isChatArchived(db, chatId,),).toBe(true,);
    await unarchiveChat(db, chatId, ownerId, "user",);
    expect(await isChatArchived(db, chatId,),).toBe(false,);
  });
});
