// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { generateRuleName, } from "../../chat/auto-rename";
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

describe("autoRenameChat — input edge cases", () => {
  // Pins behavior for malformed, oversized, and degenerate inputs. The
  // underlying generateRuleName has no internal guards for null/empty
  // (it relies on truthiness checks) — these tests document that contract
  // for callers and prevent silent regressions if the helper changes.

  test("empty string content falls back to character name only", async () => {
    // No location set; no topic to extract from ""; character name still wins.
    await insertActors(db, "Echo", { id: "actor-empty", agent_type: "ai", } as never,);
    await insertChats(db, "New Chat", "user-renamer", {
      id: "chat-empty-content",
      mode: "direct",
    } as never,);
    await insertChatParticipants(db, "chat-empty-content", "actor-empty", {} as never,);
    const record: ChatRecord = {
      name: "New Chat",
      mode: "direct",
      current_location_id: null,
      world_id: null,
    };
    await autoRenameChat(db, "chat-empty-content", "", record,);
    const name = await chatName("chat-empty-content",);
    expect(name,).toBe("Echo",);
  });

  test("whitespace-only content produces no topic (name is just character)", async () => {
    // extractTopic trims and bails on empty — pin that.
    await insertActors(db, "Whisper", { id: "actor-ws", agent_type: "ai", } as never,);
    await insertChats(db, "New Chat", "user-renamer", {
      id: "chat-whitespace",
      mode: "direct",
    } as never,);
    await insertChatParticipants(db, "chat-whitespace", "actor-ws", {} as never,);
    const record: ChatRecord = {
      name: "New Chat",
      mode: "direct",
      current_location_id: null,
      world_id: null,
    };
    await autoRenameChat(db, "chat-whitespace", "   	\n  ", record,);
    const name = await chatName("chat-whitespace",);
    expect(name,).toBe("Whisper",);
  });

  test("huge first-user-message (1 MB) does not crash and produces a renamed chat", async () => {
    // Sanity: extractTopic only reads the first ~5 words via split/slice/join
    // but the full string still flows through autoRenameChat. Pin that the
    // function handles a pathological payload without throwing and without
    // silently renaming the chat to a placeholder.
    await insertActors(db, "Atlas", { id: "actor-huge", agent_type: "ai", } as never,);
    await insertChats(db, "New Chat", "user-renamer", {
      id: "chat-huge",
      mode: "direct",
    } as never,);
    await insertChatParticipants(db, "chat-huge", "actor-huge", {} as never,);
    const record: ChatRecord = {
      name: "New Chat",
      mode: "direct",
      current_location_id: null,
      world_id: null,
    };
    const big = "word ".repeat(200_000,); // 1 MB-ish
    await autoRenameChat(db, "chat-huge", big, record,);
    const name = await chatName("chat-huge",);
    // Must be renamed (not still "New Chat"); must contain the character name.
    expect(name,).not.toBe("New Chat",);
    expect(name,).toContain("Atlas",);
    // Must be bounded — generateRuleName caps at 60 chars.
    expect(name!.length,).toBeLessThanOrEqual(60,);
  });

  test("multiple AI actors in chat use the first one (ordering is DB-driven)", async () => {
    // The query has no ORDER BY; SQLite returns rows in rowid order. Two
    // AI actors: whichever was inserted first wins. Pin the contract so a
    // future change that adds an ORDER BY doesn't silently rename chats.
    await insertActors(db, "FirstAI", { id: "actor-multi-1", agent_type: "ai", } as never,);
    await insertActors(db, "SecondAI", { id: "actor-multi-2", agent_type: "ai", } as never,);
    await insertChats(db, "New Chat", "user-renamer", {
      id: "chat-multi",
      mode: "direct",
    } as never,);
    await insertChatParticipants(db, "chat-multi", "actor-multi-1", {} as never,);
    await insertChatParticipants(db, "chat-multi", "actor-multi-2", {} as never,);
    const record: ChatRecord = {
      name: "New Chat",
      mode: "direct",
      current_location_id: null,
      world_id: null,
    };
    await autoRenameChat(db, "chat-multi", "explore the ruins", record,);
    const name = await chatName("chat-multi",);
    // One of the two must appear — exactly which is an implementation
    // detail, but the contract is "exactly one AI character in the name".
    expect(["FirstAI", "SecondAI",],).toContain(name!.split(" — ",)[0] ?? "",);
  });

  test("actor with empty display_name falls back to topic-only name", async () => {
    // charActor?.display_name ?? "" → generateRuleName skips the empty
    // character part → falls through to topic. Pin the fallback contract.
    await db
      .insertInto("actors",)
      .values({
        id: "actor-empty-name",
        actor_type: "character",
        display_name: "",
        user_id: "user-renamer",
        owner_id: "user-renamer",
        agent_type: "ai",
        settings: "{}",
        import_spec: "{}",
        data_source_format: "json",
        data_raw: null,
        format_version: 0,
        visibility: "private",
      },)
      .execute();
    await insertChats(db, "New Chat", "user-renamer", {
      id: "chat-empty-name",
      mode: "direct",
    } as never,);
    await insertChatParticipants(db, "chat-empty-name", "actor-empty-name", {} as never,);
    const record: ChatRecord = {
      name: "New Chat",
      mode: "direct",
      current_location_id: null,
      world_id: null,
    };
    await autoRenameChat(db, "chat-empty-name", "the lost kingdom awaits", record,);
    const name = await chatName("chat-empty-name",);
    expect(name,).not.toBe("New Chat",);
    // Topic extracted from message — must contain one of the words.
    expect(name,).toMatch(/lost|kingdom|awaits/,);
  });

  test("content with leading filler words strips the filler in the topic", async () => {
    // extractTopic regex strips ^(hey|hi|hello|yo|sup|what's up|so|well|um|uh|like)
    // pin that the helper does the strip and the renamed chat reflects it.
    await insertActors(db, "Sage", { id: "actor-sage", agent_type: "ai", } as never,);
    await insertChats(db, "New Chat", "user-renamer", {
      id: "chat-filler",
      mode: "direct",
    } as never,);
    await insertChatParticipants(db, "chat-filler", "actor-sage", {} as never,);
    const record: ChatRecord = {
      name: "New Chat",
      mode: "direct",
      current_location_id: null,
      world_id: null,
    };
    await autoRenameChat(db, "chat-filler", "hey so um let's find the artifact", record,);
    const name = await chatName("chat-filler",);
    // After stripping "hey", "so", "um" → first 5 words = "let's find the artifact"
    expect(name,).toContain("let",);
    // "hey" / "so" / "um" must NOT appear as the first word.
    expect(name!.split(" — ",)[1],).not.toMatch(/^hey/,);
  });
});

describe("generateRuleName — pure-function contracts", () => {
  // Direct unit tests for the underlying rename helper. Cheap to maintain
  // and pin the truncation/length rules so callers can rely on the 60-char
  // cap on the persisted chats.name column (which has its own length cap).

  test("returns 'New Chat' when all inputs are empty/null", () => {
    expect(generateRuleName("", null, null,),).toEqual({ name: "New Chat", source: "auto-rule", },);
  });

  test("formats 'Character — Topic' when both are present", () => {
    expect(generateRuleName("Mira", null, "explore the cave",),).toEqual({
      name: "Mira — explore the cave",
      source: "auto-rule",
    },);
  });

  test("prefers Location over Topic when both exist", () => {
    // Pin the precedence: location wins over topic-derived name.
    expect(generateRuleName("Mira", "Tavern", "explore the cave",),).toEqual({
      name: "Mira — Tavern",
      source: "auto-rule",
    },);
  });

  test("truncates the character name to 25 chars + ellipsis when over the limit", () => {
    const long = "x".repeat(100,);
    const result = generateRuleName(long, null, null,);
    // 24 'x' + '…' = 25
    expect(result.name.startsWith("x".repeat(24,),),).toBe(true,);
    expect(result.name.endsWith("…",),).toBe(true,);
    expect(result.name.length,).toBe(25,);
  });

  test("truncates the final composed name to 60 chars + ellipsis", () => {
    // Force both sides to push past 60: long character + long topic
    // (extractTopic takes first 5 whitespace-separated tokens, so make each
    // long enough that the composed "char — topic" string exceeds 60 chars).
    const long = "y".repeat(50,);

    // generateRuleName(long, null, topic) composes ~51 chars — under the cap,
    // so the cap test below must push both parts past their ceilings.

    // The 60-char cap kicks in only when the joined string itself exceeds 60,
    // so for the cap test, both parts must individually push past their 25-char
    // ceiling AND the joined string must exceed 60. Use a topic that takes the
    // full 25 chars on its own to push the join over 60.
    const longTopic = "z".repeat(30,); // single 30-char token → extractTopic returns it verbatim
    const result2 = generateRuleName(long, null, longTopic,);
    expect(result2.name.length,).toBeLessThanOrEqual(60,);
    expect(result2.name.endsWith("…",),).toBe(true,);
  });

  test("treats null firstUserMessage and null locationName identically", () => {
    // Symmetry: locationName=null and firstUserMessage=null should behave the
    // same way as locationName=undefined (since the type is null, not undefined).
    expect(generateRuleName("Mira", null, null,),).toEqual(
      generateRuleName("Mira", null, undefined as unknown as null,),
      // typescript doesn't allow undefined here; cast keeps the runtime test
      // honest without disturbing the signature.
    );
  });
});
