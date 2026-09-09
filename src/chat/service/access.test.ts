// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * @file Tests for chat access helpers — broad read access vs strict
 * settings-access. Validates `checkChatSettingsAccess` (the BUG-no-role-
 * restriction-for-changing-chat-settings fix) denies member/observer/guest
 * participants while still allowing admin, creator, and `role_in_chat=owner`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, } from "bun:test";
import { type Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertModerationActions,
  insertUsers,
} from "../../test-utils/insert-helpers";
import {
  checkChatAccess,
  checkChatSettingsAccess,
  getModerationBlock,
} from "./access";

let dbHandle: TestDb;
let database: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "error", },);
  dbHandle = await createTestDb();
  database = dbHandle.db;
},);

afterAll(async () => {
  if (dbHandle?.sqlite) { dbHandle.sqlite.close(); }
},);

beforeEach(async () => {
  // Wipe between tests for isolation.
  await database.deleteFrom("chat_participants",).execute();
  await database.deleteFrom("chats",).execute();
  await database.deleteFrom("actors",).execute();
  await database.deleteFrom("users",).execute();
  await database.deleteFrom("moderation_actions",).execute();
},);

async function seedChatWithParticipants(opts: {
  creatorId: string;
  participants?: { userId: string; role: "owner" | "member" | "observer" | "guest" }[];
},): Promise<string> {
  await insertUsers(database, `u-${opts.creatorId}`, "User", { id: opts.creatorId, } as never,);
  await insertActors(database, opts.creatorId, {
    id: opts.creatorId,
    user_id: opts.creatorId,
    owner_id: opts.creatorId,
  } as never,);
  if (opts.participants) {
    for (const p of opts.participants) {
      await insertUsers(database, `u-${p.userId}`, "User", { id: p.userId, } as never,);
      await insertActors(database, p.userId, {
        id: p.userId,
        user_id: p.userId,
        owner_id: p.userId,
      } as never,);
    }
  }
  await insertChats(database, "Test Chat", opts.creatorId, {
    id: `chat-${opts.creatorId}`,
    type: "group",
    mode: "group",
  } as never,);
  await insertChatParticipants(database, `chat-${opts.creatorId}`, opts.creatorId, {
    role_in_chat: "owner",
  } as never,);
  if (opts.participants) {
    for (const p of opts.participants) {
      await insertChatParticipants(database, `chat-${opts.creatorId}`, p.userId, {
        role_in_chat: p.role,
      } as never,);
    }
  }
  return `chat-${opts.creatorId}`;
}

describe("checkChatAccess (broad read/join)", () => {
  it("grants admin role via admin.chat permission", async () => {
    const chatId = await seedChatWithParticipants({ creatorId: "u-owner", },);
    const result = await checkChatAccess(database, chatId, "u-other", "admin",);
    expect(result.ok,).toBe(true,);
  });

  it("grants chat creator", async () => {
    const chatId = await seedChatWithParticipants({ creatorId: "u-owner", },);
    const result = await checkChatAccess(database, chatId, "u-owner", null,);
    expect(result.ok,).toBe(true,);
  });

  it("grants any participant (member)", async () => {
    const chatId = await seedChatWithParticipants({
      creatorId: "u-owner",
      participants: [{ userId: "u-member", role: "member", },],
    },);
    const result = await checkChatAccess(database, chatId, "u-member", null,);
    expect(result.ok,).toBe(true,);
  });

  it("denies non-participant", async () => {
    const chatId = await seedChatWithParticipants({ creatorId: "u-owner", },);
    const result = await checkChatAccess(database, chatId, "u-stranger", null,);
    expect(result.ok,).toBe(false,);
  });
});

describe("checkChatSettingsAccess (strict settings-mutation)", () => {
  it("grants admin role", async () => {
    const chatId = await seedChatWithParticipants({ creatorId: "u-owner", },);
    const result = await checkChatSettingsAccess(database, chatId, "u-other", "admin",);
    expect(result.ok,).toBe(true,);
  });

  it("grants chat creator", async () => {
    const chatId = await seedChatWithParticipants({ creatorId: "u-owner", },);
    const result = await checkChatSettingsAccess(database, chatId, "u-owner", null,);
    expect(result.ok,).toBe(true,);
  });

  it("grants participant with role_in_chat=owner", async () => {
    const chatId = await seedChatWithParticipants({
      creatorId: "u-owner",
      participants: [{ userId: "u-coowner", role: "owner", },],
    },);
    const result = await checkChatSettingsAccess(database, chatId, "u-coowner", null,);
    expect(result.ok,).toBe(true,);
  });

  it("denies participant with role_in_chat=member", async () => {
    const chatId = await seedChatWithParticipants({
      creatorId: "u-owner",
      participants: [{ userId: "u-member", role: "member", },],
    },);
    const result = await checkChatSettingsAccess(database, chatId, "u-member", null,);
    expect(result.ok,).toBe(false,);
    if (!result.ok) { expect(result.error.code,).toBe("forbidden",); }
  });

  it("denies observer participant", async () => {
    const chatId = await seedChatWithParticipants({
      creatorId: "u-owner",
      participants: [{ userId: "u-observer", role: "observer", },],
    },);
    const result = await checkChatSettingsAccess(database, chatId, "u-observer", null,);
    expect(result.ok,).toBe(false,);
  });

  it("denies guest participant", async () => {
    const chatId = await seedChatWithParticipants({
      creatorId: "u-owner",
      participants: [{ userId: "u-guest", role: "guest", },],
    },);
    const result = await checkChatSettingsAccess(database, chatId, "u-guest", null,);
    expect(result.ok,).toBe(false,);
  });

  it("denies non-participant", async () => {
    const chatId = await seedChatWithParticipants({ creatorId: "u-owner", },);
    const result = await checkChatSettingsAccess(database, chatId, "u-stranger", null,);
    expect(result.ok,).toBe(false,);
  });
});

describe("checkChatAccess moderation enforcement (chat/moderation.ts wiring)", () => {
  it("denies globally banned participant with forbidden", async () => {
    const chatId = await seedChatWithParticipants({
      creatorId: "u-owner",
      participants: [{ userId: "u-member", role: "member", },],
    },);
    await insertModerationActions(database, "ban", "u-member", "u-owner", "spam", "global",);
    const result = await checkChatAccess(database, chatId, "u-member", null,);
    expect(result,).toEqual({ ok: false, error: { code: "forbidden", message: "User is banned", }, },);
  });

  it("denies chat-scoped blocked participant", async () => {
    const chatId = await seedChatWithParticipants({
      creatorId: "u-owner",
      participants: [{ userId: "u-member", role: "member", },],
    },);
    await insertModerationActions(database, "block", "u-member", "u-owner", "spam", "chat", { scope_id: chatId, },);
    const result = await checkChatAccess(database, chatId, "u-member", null,);
    expect(result,).toEqual({ ok: false, error: { code: "forbidden", message: "User is blocked", }, },);
  });

  it("ignores block scoped to a different chat", async () => {
    const chatId = await seedChatWithParticipants({
      creatorId: "u-owner",
      participants: [{ userId: "u-member", role: "member", },],
    },);
    await insertModerationActions(database, "block", "u-member", "u-owner", "spam", "chat", {
      scope_id: "other-chat",
    },);
    const result = await checkChatAccess(database, chatId, "u-member", null,);
    expect(result,).toEqual({ ok: true, },);
  });

  it("ignores expired and revoked rows", async () => {
    const chatId = await seedChatWithParticipants({
      creatorId: "u-owner",
      participants: [{ userId: "u-member", role: "member", },],
    },);
    await insertModerationActions(database, "ban", "u-member", "u-owner", "old", "global", {
      expires_at: "2000-01-01T00:00:00Z",
    },);
    await insertModerationActions(database, "ban", "u-member", "u-owner", "lifted", "global", {
      deleted_at: "2026-01-01T00:00:00Z",
    },);
    const result = await checkChatAccess(database, chatId, "u-member", null,);
    expect(result,).toEqual({ ok: true, },);
    expect(await getModerationBlock(database, chatId, "u-member",),).toBeNull();
  });

  it("ignores nsfw-scope rows (separate access_status machine)", async () => {
    const chatId = await seedChatWithParticipants({
      creatorId: "u-owner",
      participants: [{ userId: "u-member", role: "member", },],
    },);
    await insertModerationActions(database, "ban", "u-member", "admin", "nsfw", "nsfw",);
    const result = await checkChatAccess(database, chatId, "u-member", null,);
    expect(result,).toEqual({ ok: true, },);
  });

  it("keeps not_found for banned non-participant (no ban oracle)", async () => {
    const chatId = await seedChatWithParticipants({ creatorId: "u-owner", },);
    await insertUsers(database, "u-stranger", "User", { id: "u-stranger", } as never,);
    await insertModerationActions(database, "ban", "u-stranger", "u-owner", "spam", "global",);
    const result = await checkChatAccess(database, chatId, "u-stranger", null,);
    expect(result,).toEqual({ ok: false, error: { code: "not_found", message: "Chat not found", }, },);
  });

  it("admin bypasses ban for moderation duties", async () => {
    const chatId = await seedChatWithParticipants({ creatorId: "u-owner", },);
    await insertUsers(database, "u-admin", "User", { id: "u-admin", } as never,);
    await insertModerationActions(database, "ban", "u-admin", "u-owner", "spam", "global",);
    const result = await checkChatAccess(database, chatId, "u-admin", "admin",);
    expect(result.ok,).toBe(true,);
  });
});
