// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GM guidance slash command tests — /guide /constraint /scene /target
 * /priority /skip against an in-memory DB. Each command must persist through
 * the existing gm-guidance / turn-skip backends, not a private store.
 */
import { beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { GmGuidance, } from "../../chat/types/config";
import type { CommandContext, CommandResult, CommandHandler, } from "./registry";
import { getCommand, } from "./registry";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { updateGmGuidance, } from "../../chat/service";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChatParticipants, insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import "./gm-guidance";

const CHAT_ID = "chat-1";
const OWNER = "user-1";
const HERO = "hero-1";
const VILLAIN = "villain-1";
const MEMBER = "member-1";

let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());
  await insertUsers(db, "gm", "GM", { id: OWNER as never, },);
  for (const [id, name,] of [[OWNER, "GM",], [HERO, "Aria",], [VILLAIN, "Drak",], [MEMBER, "Peon",],] as const) {
    await insertActors(db, name, { id: id as never, actor_type: "user" as never, },);
  }
  await insertChats(db, "Story Chat", OWNER, { id: CHAT_ID as never, mode: "story" as never, },);
  await insertChatParticipants(db, CHAT_ID, OWNER, { role_in_chat: "owner" as never, },);
  await insertChatParticipants(db, CHAT_ID, HERO, { role_in_chat: "member" as never, },);
  await insertChatParticipants(db, CHAT_ID, VILLAIN, { role_in_chat: "member" as never, },);
  await insertChatParticipants(db, CHAT_ID, MEMBER, { role_in_chat: "member" as never, },);
},);

/** Resolve a registered handler by name, failing the test if absent. */
function handler(name: string,): CommandHandler {
  const found = getCommand(name,);
  if (!found) { throw new Error(`/${name} not registered`,); }
  return found;
}

function ctx(userId = OWNER, mode = "story", chatId = CHAT_ID,): CommandContext {
  return {
    chatId,
    db,
    userId,
    activeChat: { id: chatId, mode, worldId: "world-1", },
  };
}

/** Current persisted guidance blob. */
async function guidance(): Promise<GmGuidance> {
  const row = await db
    .selectFrom("chats",)
    .select("gm_config",)
    .where("id", "=", CHAT_ID,)
    .executeTakeFirstOrThrow();
  const parsed = JSON.parse(row.gm_config ?? "{}",) as { gmGuidance?: GmGuidance };
  return parsed.gmGuidance ?? { constraints: [], turnPriority: {}, };
}

/** @param name @param args */
async function run(name: string, args: string[], context = ctx(),): Promise<CommandResult> {
  return await handler(name,)(args, context,);
}

describe("gm guidance commands", () => {
  test("all six guidance commands are registered", () => {
    for (const name of ["guide", "constraint", "scene", "target", "priority", "skip",]) {
      expect(getCommand(name,),).toBeDefined();
    }
  });

  test("/scene sets and persists the scene description", async () => {
    const result = await run("scene", ["A", "storm", "breaks",],);
    expect(result.handled,).toBe(true,);
    expect((await guidance()).sceneDescription,).toBe("A storm breaks",);
  });

  test("/constraint appends a constraint and ignores duplicates", async () => {
    await run("constraint", ["stay in character",],);
    await run("constraint", ["stay in character",],);
    const stored = await guidance();
    // Order-independent: /guide appends to the same list, so assert the
    // occurrence count rather than the whole array.
    expect(stored.constraints.filter((c,) => c === "stay in character").length,).toBe(1,);
  });

  test("/guide adds a narrative direction", async () => {
    await run("guide", ["raise", "the", "stakes",],);
    expect((await guidance()).constraints,).toContain("raise the stakes",);
  });

  test("/guide with no args reports current guidance", async () => {
    const result = await run("guide", [],);
    expect(result.systemMessage,).toContain("**GM guidance**",);
    expect(result.systemMessage,).toContain("A storm breaks",);
  });

  test("/target sets the target character", async () => {
    await run("target", ["Drak",],);
    expect((await guidance()).targetCharacter,).toBe("Drak",);
  });

  test("/priority resolves a character name to its actor id", async () => {
    const result = await run("priority", ["Aria", "high",],);
    expect(result.systemMessage,).toContain("priority set to high",);
    expect((await guidance()).turnPriority,).toEqual({ [HERO]: "high", },);
  });

  test("/priority rejects an unknown level and unknown characters", async () => {
    const badLevel = await run("priority", ["Aria", "urgent",],);
    expect(badLevel.systemMessage,).toContain("Usage:",);
    const unknown = await run("priority", ["Nobody", "low",],);
    expect(unknown.systemMessage,).toContain("not a participant",);
  });

  test("/skip records a turn-skip event for the character", async () => {
    const result = await run("skip", ["Drak",],);
    expect(result.systemMessage,).toContain("skips this beat",);
    const rows = await db
      .selectFrom("messages",)
      .select(["actor_id", "content_type",],)
      .where("chat_id", "=", CHAT_ID,)
      .execute();
    const skip = rows.find((row,) => row.content_type === "turn_skip",);
    expect(skip?.actor_id,).toBe(VILLAIN,);
    expect(skip?.content_type,).toBe("turn_skip",);
  });

  test("/skip refuses a character that is not a participant", async () => {
    const result = await run("skip", ["Nobody",],);
    expect(result.systemMessage,).toContain("not a participant",);
  });

  test("commands are refused outside a story chat", async () => {
    const result = await run("scene", ["x",], ctx(OWNER, "group",),);
    expect(result.systemMessage,).toContain("not a story chat",);
  });

  test("accepts a chat whose mode is 'direct' but gm_config.storyMode is true", async () => {
    const directId = "chat-direct";
    await insertChats(db, "Direct Story", OWNER, { id: directId as never, mode: "direct" as never, },);
    await insertChatParticipants(db, directId, OWNER, { role_in_chat: "owner" as never, },);
    await updateGmGuidance(db, directId, { storyMode: true, },);

    const result = await run("scene", ["Tense", "silence",], ctx(OWNER, "direct", directId,),);
    expect(result.systemMessage,).toContain("scene set",);
    const row = await db
      .selectFrom("chats",)
      .select("gm_config",)
      .where("id", "=", directId,)
      .executeTakeFirstOrThrow();
    const parsed = JSON.parse(row.gm_config ?? "{}",) as { gmGuidance?: GmGuidance };
    expect(parsed.gmGuidance?.sceneDescription,).toBe("Tense silence",);
  });

  test("non-owner participants are denied", async () => {
    const result = await run("scene", ["x",], ctx(MEMBER,),);
    expect(result.systemMessage,).toContain("**Permission denied:**",);
  });

  test("missing db and user contexts are reported", async () => {
    const noDb = await run("scene", ["x",], { chatId: CHAT_ID, userId: OWNER, },);
    expect(noDb.systemMessage,).toContain("missing database",);
    const noUser = await run("scene", ["x",], { chatId: CHAT_ID, db, },);
    expect(noUser.systemMessage,).toContain("missing user",);
  });
});
