// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * @file Tests for chat access helpers — broad read access vs strict
 * settings-access. Validates `checkChatSettingsAccess` (the BUG-no-role-
 * restriction-for-changing-chat-settings fix) denies member/observer/guest
 * participants while still allowing admin, creator, and `role_in_chat=owner`.
 */
/* eslint-disable jsdoc/require-jsdoc */
import { afterAll, beforeAll, beforeEach, describe, expect, it, } from "bun:test";
import { type Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import {
  checkChatAccess,
  checkChatSettingsAccess,
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
