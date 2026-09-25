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
  insertAssetLinks,
  insertAssets,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../../test-utils/insert-helpers";
import { hardDeleteChat, } from "../visibility";
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
      message: "Only the chat creator, an Owner, or a GM can change settings",
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

describe("chat archive asset-links cascade (FEAT-chat-archive-asset-cascade)", () => {
  let db: Kysely<DB>;
  const ownerId: string = crypto.randomUUID();
  const chatId: string = crypto.randomUUID();
  const assetId: string = crypto.randomUUID();

  beforeEach(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: ownerId, } as never,);
    await insertActors(db, "Owner", {
      id: ownerId,
      user_id: ownerId,
      owner_id: ownerId,
    } as never,);
    await insertChats(db, "Asset Cascade", ownerId, { id: chatId, } as never,);
    await insertChatParticipants(db, chatId, ownerId, { role_in_chat: "owner", },);
    await insertAssets(db, ownerId, "asset.png", "image/png", "image", 1, "asset.png", {
      id: assetId,
    },);
    await insertAssetLinks(db, assetId, "chat", chatId,);
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  test("archiveChat stamps asset_links.archived_at for linked rows", async () => {
    await archiveChat(db, chatId, ownerId, "user",);

    const link = await db
      .selectFrom("asset_links",)
      .select("archived_at",)
      .where("asset_id", "=", assetId,)
      .where("entity_type", "=", "chat",)
      .where("entity_id", "=", chatId,)
      .executeTakeFirst();
    expect(link?.archived_at,).not.toBeNull();
    expect(typeof link?.archived_at,).toBe("string",);
  });

  test("unarchiveChat clears asset_links.archived_at", async () => {
    await archiveChat(db, chatId, ownerId, "user",);
    await unarchiveChat(db, chatId, ownerId, "user",);

    const link = await db
      .selectFrom("asset_links",)
      .select("archived_at",)
      .where("asset_id", "=", assetId,)
      .where("entity_type", "=", "chat",)
      .where("entity_id", "=", chatId,)
      .executeTakeFirst();
    expect(link?.archived_at,).toBeNull();
  });

  test("hardDeleteChat hard-removes asset_links rows regardless of archive state", async () => {
    await archiveChat(db, chatId, ownerId, "user",);

    const result = await hardDeleteChat(db, chatId, ownerId, "user",);
    expect(result,).toEqual({ ok: true, chatId, },);

    const links = await db
      .selectFrom("asset_links",)
      .select("asset_id",)
      .where("entity_type", "=", "chat",)
      .where("entity_id", "=", chatId,)
      .execute();
    expect(links,).toHaveLength(0,);
  });
});

describe("chat archive / purge notifications (FEAT-chat-archive-purge-notifications)", () => {
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
    await insertChats(db, "Notify Me", ownerId, { id: chatId, } as never,);
    await insertChatParticipants(db, chatId, ownerId, { role_in_chat: "owner", },);
    await insertChatParticipants(db, chatId, memberId, { role_in_chat: "member", },);
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  test("archiveChat emits a chat_archived notification to the non-actor participant", async () => {
    await archiveChat(db, chatId, ownerId, "user",);

    const rows = await db
      .selectFrom("notifications",)
      .select(["user_id", "type", "title", "data",],)
      .where("user_id", "=", memberId,)
      .execute();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.type,).toBe("system",);
    expect(rows[0]?.title,).toBe("Chat archived",);
    // Actor does not receive a notification.
    const actorRows = await db
      .selectFrom("notifications",)
      .select("id",)
      .where("user_id", "=", ownerId,)
      .execute();
    expect(actorRows,).toHaveLength(0,);
  });

  test("unarchiveChat emits a chat_restored notification to the non-actor participant", async () => {
    await archiveChat(db, chatId, ownerId, "user",);
    await db.deleteFrom("notifications",).execute();

    await unarchiveChat(db, chatId, ownerId, "user",);

    const rows = await db
      .selectFrom("notifications",)
      .select(["user_id", "title",],)
      .where("user_id", "=", memberId,)
      .execute();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.title,).toBe("Chat restored",);
  });

  test("hardDeleteChat emits a chat_purged notification to the non-actor participant", async () => {
    const result = await hardDeleteChat(db, chatId, ownerId, "user",);
    expect(result,).toEqual({ ok: true, chatId, },);

    const rows = await db
      .selectFrom("notifications",)
      .select(["user_id", "title",],)
      .where("user_id", "=", memberId,)
      .execute();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.title,).toBe("Chat permanently deleted",);
  });

  test("notifications are skipped when System is disabled in user prefs (silent skip)", async () => {
    // Disable System notifications for the member.
    await db
      .updateTable("users",)
      .set({ settings: JSON.stringify({ notifications: { enabled: { system: false, }, }, },), },)
      .where("id", "=", memberId,)
      .execute();

    await archiveChat(db, chatId, ownerId, "user",);

    const rows = await db
      .selectFrom("notifications",)
      .select("id",)
      .where("user_id", "=", memberId,)
      .execute();
    expect(rows,).toHaveLength(0,);
  });
});
