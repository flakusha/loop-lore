// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Routes/messages command dispatch tests.
 *
 * Covers dispatchCommand end-to-end against a migrated test DB (handler
 * execution, system-message persistence, unhandled passthrough) plus the
 * shared chat-context helpers used by both the slash and GM tool paths.
 */
import { beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { commandActiveChat, dispatchCommand, fetchChatAndRole, } from "./command";

beforeAll(() => {
  createLogger({ level: "error", },);
},);

const config = {
  encryption: { compressThreshold: 1000, compressAlgorithm: "none", },
} as unknown as Config;

interface Setup {
  db: Kysely<DB>;
  chatId: string;
  userId: string;
}

async function setup(): Promise<Setup> {
  const { db, } = await createTestDb();
  const userId = "user-cmd-test";
  const chatId = "chat-cmd-test";
  await insertUsers(db, userId, "Cmd User", { id: userId, },);
  await insertActors(db, "Cmd User", {
    id: userId,
    actor_type: "user",
    user_id: userId,
    owner_id: userId,
  },);
  await insertChats(db, "Cmd Chat", userId, { id: chatId, },);
  return { db, chatId, userId, };
}

describe("fetchChatAndRole", () => {
  it("returns the chat row and defaults the role to member", async () => {
    const { db, chatId, userId, } = await setup();
    const { chat, role, } = await fetchChatAndRole(db, chatId, userId,);
    expect(chat?.id,).toBe(chatId,);
    expect(chat?.gm_config,).toBeNull();
    expect(role,).toBe("member",);
  });

  it("returns undefined chat for an unknown chat id", async () => {
    const { db, userId, } = await setup();
    const { chat, role, } = await fetchChatAndRole(db, "chat-missing", userId,);
    expect(chat,).toBeUndefined();
    expect(role,).toBe("member",);
  });
});

describe("commandActiveChat", () => {
  it("maps a chat row with null mode/type/world to undefined fields", () => {
    const active = commandActiveChat({
      id: "c1",
      mode: null,
      type: null,
      gm_config: null,
      world_id: null,
    },);
    expect(active,).toEqual({ id: "c1", mode: undefined, type: undefined, worldId: undefined, },);
  });

  it("returns undefined for a missing chat row", () => {
    expect(commandActiveChat(undefined,),).toBeUndefined();
  });
});

describe("dispatchCommand", () => {
  it("handles a slash command and persists its system message", async () => {
    const { db, chatId, userId, } = await setup();
    const outcome = await dispatchCommand(db, config, userId, chatId, "/narrate The sky darkens.",);
    expect(outcome.handled,).toBe(true,);
    const row = await db
      .selectFrom("messages",)
      .select(["role", "content",],)
      .where("chat_id", "=", chatId,)
      .where("role", "=", MessageRole.System as never,)
      .orderBy("created_at", "desc",)
      .executeTakeFirst();
    expect(row?.content,).toContain("The sky darkens.",);
  });

  it("returns handled:false for content that is not a command", async () => {
    const { db, chatId, userId, } = await setup();
    const outcome = await dispatchCommand(db, config, userId, chatId, "just talking",);
    expect(outcome.handled,).toBe(false,);
  });

  it("returns handled:false for an unregistered command name", async () => {
    const { db, chatId, userId, } = await setup();
    const outcome = await dispatchCommand(db, config, userId, chatId, "/definitely-not-a-command",);
    expect(outcome.handled,).toBe(false,);
  });
});
