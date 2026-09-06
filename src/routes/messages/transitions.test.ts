// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertLocations,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { autoRenameChat, type ChatRecord, } from "./transitions";

createLogger({ level: "error", },);

let db: Kysely<DB>;
let sqlite: Database;

beforeAll(async () => {
  ({ db, sqlite, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

beforeEach(async () => {
  resetTestDb(sqlite,);
  await insertUsers(db, "renamer", "Renamer", { id: "user-renamer", },);
  await insertWorlds(db, "user-renamer", "World", { id: "world-1", },);
  await insertLocations(db, "world-1", "Tavern", { id: "loc-tavern", },);
},);

/**
 * @param chatId chat row id
 */
async function chatName(chatId: string,): Promise<string | null | undefined> {
  const row = await db.selectFrom("chats",).select("name",).where("id", "=", chatId,).executeTakeFirst();
  return row?.name;
}

describe("autoRenameChat", () => {
  test("skips non-direct chats", async () => {
    await insertChats(db, "New Chat", "user-renamer", { id: "chat-group", mode: "group", } as never,);
    const record: ChatRecord = { name: "New Chat", mode: "group", current_location_id: null, world_id: null, };
    await autoRenameChat(db, "chat-group", "hello there", record,);
    expect(await chatName("chat-group",),).toBe("New Chat",);
  });

  test("skips direct chats that already have a custom name", async () => {
    await insertChats(db, "My Adventure", "user-renamer", { id: "chat-named", mode: "direct", } as never,);
    const record: ChatRecord = { name: "My Adventure", mode: "direct", current_location_id: null, world_id: null, };
    await autoRenameChat(db, "chat-named", "hello there", record,);
    expect(await chatName("chat-named",),).toBe("My Adventure",);
  });

  test("renames a fresh direct chat with character and location", async () => {
    await insertActors(db, "Mira", { id: "actor-mira", agent_type: "ai", } as never,);
    await insertChats(db, "New Chat", "user-renamer", {
      id: "chat-fresh",
      mode: "direct",
      current_location_id: "loc-tavern",
    } as never,);
    await insertChatParticipants(db, "chat-fresh", "actor-mira", {} as never,);
    const record: ChatRecord = {
      name: "New Chat",
      mode: "direct",
      current_location_id: "loc-tavern",
      world_id: "world-1",
    };
    await autoRenameChat(db, "chat-fresh", "hello there", record,);
    const name = await chatName("chat-fresh",);
    expect(name,).not.toBe("New Chat",);
    expect(name,).toContain("Mira",);
    expect(name,).toContain("Tavern",);
  });

  test("renames an empty-named chat from the message topic when no actor is present", async () => {
    await insertChats(db, "", "user-renamer", { id: "chat-topic", mode: "direct", } as never,);
    const record: ChatRecord = { name: "", mode: "direct", current_location_id: null, world_id: null, };
    await autoRenameChat(db, "chat-topic", "let us explore the dragon cave", record,);
    const name = await chatName("chat-topic",);
    expect(name,).not.toBe("",);
    expect(name,).toContain("dragon",);
  });

  test("renames even when the linked location row is gone", async () => {
    await insertActors(db, "Narrator", { id: "actor-narr", agent_type: "narrator", } as never,);
    await insertChats(db, "New Chat", "user-renamer", {
      id: "chat-noloc",
      mode: "direct",
    } as never,);
    await insertChatParticipants(db, "chat-noloc", "actor-narr", {} as never,);
    const record: ChatRecord = {
      name: "New Chat",
      mode: "direct",
      current_location_id: "loc-missing",
      world_id: "world-1",
    };
    await autoRenameChat(db, "chat-noloc", "the road ahead is dark", record,);
    const name = await chatName("chat-noloc",);
    expect(name,).not.toBe("New Chat",);
    expect(name,).toContain("Narrator",);
  });

  test("handles an undefined chat record without touching the row", async () => {
    await insertChats(db, "Untouched", "user-renamer", { id: "chat-undef", mode: "direct", } as never,);
    await autoRenameChat(db, "chat-undef", "hello", undefined,);
    expect(await chatName("chat-undef",),).toBe("Untouched",);
  });
});
