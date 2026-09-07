// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Handler-branch coverage for the /stats command
 * (src/assistant/commands/stats.ts).
 *
 * `formatStats` is covered by stats.test.ts; here the registered handler
 * is exercised through the command registry: missing database, no
 * character in chat, missing stats row, the impersonation precedence
 * path, and the success path — plus damaged inputs (unknown chat).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { DB, } from "../../db/schema";
import { createCharacterStats, } from "../../rpg/service/character-stats";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import type { CommandContext, CommandHandler, CommandResult, } from "./registry";
import { getCommand, } from "./registry";
import "./stats";

/** Resolve the registered /stats handler, failing loudly when missing. */
function mustGet(): CommandHandler {
  const handler = getCommand("stats",);
  if (!handler) { throw new Error("command not registered: /stats",); }
  return handler;
}

let testDb: Kysely<DB>;
let testSqlite: Database;

beforeAll(async () => {
  const env = await createTestDb();
  testDb = env.db;
  testSqlite = env.sqlite;
},);

afterAll(() => {
  testSqlite.close();
},);

/** Fresh chat/user/actor fixtures per test (own isolated database). */
async function seedIds(): Promise<{ chatId: string; userActorId: string; charActorId: string }> {
  resetTestDb(testSqlite,);
  const chatId = randomUUID();
  const userActorId = randomUUID();
  const charActorId = randomUUID();
  await testDb.insertInto("users",).values({
    id: "stats-user",
    username: "stats-user",
    display_name: "Stats User",
    role: "user",
    status: "active",
    settings: "{}",
  },).execute();
  await testDb.insertInto("chats",).values({
    id: chatId,
    name: "Stats Chat",
    type: "direct",
    mode: "direct",
    created_by: "stats-user",
  },).execute();
  await testDb.insertInto("actors",).values({
    id: userActorId,
    actor_type: "user",
    display_name: "Player",
    agent_type: "none",
    settings: "{}",
    format_version: 0,
    import_spec: "{}",
  },).execute();
  await testDb.insertInto("actors",).values({
    id: charActorId,
    actor_type: "character",
    display_name: "Aria",
    agent_type: "ai",
    settings: "{}",
    format_version: 0,
    import_spec: "{}",
  },).execute();
  return { chatId, userActorId, charActorId, };
}

/** Join an actor to the chat, optionally impersonating another actor. */
async function joinChat(chatId: string, actorId: string, impersonateActorId?: string,): Promise<void> {
  await testDb.insertInto("chat_participants",).values({
    chat_id: chatId,
    actor_id: actorId,
    impersonate_actor_id: impersonateActorId ?? null,
  },).execute();
}

describe("/stats handler branches", () => {
  test("reports unavailable when the context has no database", async () => {
    const result = await mustGet()([], { chatId: "chat-1", },) as CommandResult;
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("Stats unavailable",);
  });

  test("reports no character when the chat has no participants", async () => {
    const { chatId, userActorId, } = await seedIds();
    const ctx: CommandContext = { chatId, userId: userActorId, db: testDb, };
    const result = await mustGet()([], ctx,) as CommandResult;
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("no character found",);
  });

  test("reports no character for an unknown chat", async () => {
    await seedIds();
    const ctx: CommandContext = { chatId: randomUUID(), userId: randomUUID(), db: testDb, };
    const result = await mustGet()([], ctx,) as CommandResult;
    expect(result.systemMessage,).toContain("no character found",);
  });

  test("reports missing stats when the character has no stats row", async () => {
    const { chatId, userActorId, charActorId, } = await seedIds();
    await joinChat(chatId, userActorId,);
    await joinChat(chatId, charActorId,);
    const ctx: CommandContext = { chatId, userId: userActorId, db: testDb, };
    const result = await mustGet()([], ctx,) as CommandResult;
    expect(result.handled,).toBe(true,);
    expect(result.systemMessage,).toContain("Aria",);
    expect(result.systemMessage,).toContain("no stats recorded yet",);
  });

  test("shows stats once a stats row exists", async () => {
    const { chatId, userActorId, charActorId, } = await seedIds();
    await joinChat(chatId, userActorId,);
    await joinChat(chatId, charActorId,);
    await createCharacterStats({ database: testDb, }, {
      actorId: charActorId,
      level: 3,
      hp: 18,
      maxHp: 24,
      mp: 5,
      maxMp: 9,
      ac: 13,
    },);
    const ctx: CommandContext = { chatId, userId: userActorId, db: testDb, };
    const result = await mustGet()([], ctx,) as CommandResult;
    expect(result.handled,).toBe(true,);
    expect(result.action,).toBe("show-stats",);
    expect(result.systemMessage,).toContain("Aria",);
    expect(result.systemMessage,).toContain("**Level:** 3",);
    expect(result.systemMessage,).toContain("18/24",);
    const payload = result.actionPayload as { characterId: string };
    expect(payload.characterId,).toBe(charActorId,);
  });

  test("prefers the impersonated character over chat participants", async () => {
    const { chatId, userActorId, charActorId, } = await seedIds();
    await joinChat(chatId, userActorId, charActorId,);
    await createCharacterStats({ database: testDb, }, {
      actorId: charActorId,
      hp: 10,
      maxHp: 10,
      ac: 10,
    },);
    const ctx: CommandContext = { chatId, userId: userActorId, db: testDb, };
    const result = await mustGet()([], ctx,) as CommandResult;
    expect(result.action,).toBe("show-stats",);
    expect(result.systemMessage,).toContain("Aria",);
  });
});
