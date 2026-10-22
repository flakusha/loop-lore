// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Real coverage for group-chat (ticket TASK-2026-020 / git 3234406): the
 * mention-parser boundaries not exercised by mention.boundary.test.ts, plus
 * the turn-selector helpers (checkPaused, fetchImpersonatedActorIds) against
 * a real per-test SQLite database via createTestDb().
 *
 * Resource contract: each test creates its own throwaway DB and destroys it
 * in a finally block; no fixed paths, ports, or cross-test state.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { ActorType, AgentType, ChatType, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertLocations,
  insertUsers,
  insertWorlds,
} from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import {
  detectPassToken,
  parseAssetMentions,
  parseMentions,
  stripAssetMentions,
  stripLeadingMention,
} from "./mention-parser";
import { checkPaused, fetchImpersonatedActorIds, } from "./turn-selector";

describe("mention parsing boundaries", () => {
  test("parseMentions records exact offsets for overlapping adjacent tokens", () => {
    const res = parseMentions("@Luna@Max @Kai",);
    expect(res.length,).toBe(3,);
    expect(res[0],).toMatchObject({ raw: "@Luna", name: "Luna", start: 0, end: 5, },);
    expect(res[1],).toMatchObject({ raw: "@Max", name: "Max", start: 5, end: 9, },);
    expect(res[2],).toMatchObject({ raw: "@Kai", name: "Kai", start: 10, end: 14, },);
  });

  test("parseMentions captures trailing digits, underscores and hyphens", () => {
    const res = parseMentions("hey @User_2-x!",);
    expect(res[0]?.name,).toBe("User_2-x",);
  });

  test("the ASCII token regex does match the @token inside emails (known limitation)", () => {
    // Ticket TASK-group-chat-minors flags this: the address-part token pings
    // a participant named "example". Current behavior is asserted verbatim;
    // tightening the regex is that ticket's fix, not this coverage's job.
    expect(parseMentions("email me at bob@example.com",),).toEqual([
      { raw: "@example", name: "example", start: 15, end: 23, },
    ],);
  });

  test("parseMentions is ASCII-only — unicode names do not produce partial tokens", () => {
    // "@Ünicode" captures nothing: Ü is outside [A-Za-z0-9_-].
    expect(parseMentions("@Ünicode hello",),).toEqual([],);
  });

  test("stripLeadingMention removes an addressing prefix but keeps mid-message mentions", () => {
    expect(stripLeadingMention("@Luna make a video",),).toBe("make a video",);
    expect(stripLeadingMention("  @Luna   spaced",),).toBe("spaced",);
    expect(stripLeadingMention("please @Luna look",),).toBe("please @Luna look",);
    expect(stripLeadingMention("no mention",),).toBe("no mention",);
  });

  test("stripLeadingMention preserves @asset: tokens (attachment, not addressing)", () => {
    expect(stripLeadingMention("@asset:abc123 look at this",),).toBe("@asset:abc123 look at this",);
  });

  test("detectPassToken matches only a trailing, whitespace-tolerant [PASS]", () => {
    expect(detectPassToken("I have nothing to add [PASS]",),).toBe(true,);
    expect(detectPassToken("[pass]",),).toBe(true,);
    expect(detectPassToken("  [ Pass ]  ",),).toBe(true,);
    expect(detectPassToken("hello",),).toBe(false,);
    expect(detectPassToken("I should PASS this",),).toBe(false,);
    expect(detectPassToken("[PASS] mid-message",),).toBe(false,);
    expect(detectPassToken("",),).toBe(false,);
  });

  test("parseAssetMentions extracts distinct ids in order of appearance", () => {
    expect(parseAssetMentions("see @asset:a_1 then @asset:b-2 again @asset:a_1",),)
      .toEqual(["a_1", "b-2",],);

    expect(parseAssetMentions("no assets here",),).toEqual([],);
  });

  test("stripAssetMentions removes tokens and collapses the leftover spacing", () => {
    expect(stripAssetMentions("look  @asset:a1 and @asset:b2  nice",),).toBe("look and nice",);
    expect(stripAssetMentions("untouched",),).toBe("untouched",);
  });
});

describe("checkPaused (story_state parsing)", () => {
  test("false for null, empty, invalid JSON, and non-paused state", () => {
    expect(checkPaused(null,),).toBe(false,);
    expect(checkPaused("",),).toBe(false,);
    expect(checkPaused("not json at all",),).toBe(false,);
    expect(checkPaused('{"isPaused":false}',),).toBe(false,);
    expect(checkPaused('{"other":1}',),).toBe(false,);
  });

  test("true only when isPaused is exactly true", () => {
    expect(checkPaused('{"isPaused":true}',),).toBe(true,);
    expect(checkPaused('{"isPaused":1}',),).toBe(false,);
  });
});

describe("fetchImpersonatedActorIds (impersonation scope)", () => {
  interface Ctx {
    db: Kysely<DB>;
    userId: string;
    actorId: string;
  }

  /** Seed a user + character; returns a live DB the test must destroy. */
  async function seed(): Promise<Ctx> {
    const { db, } = await createTestDb();
    const userId = uid();
    await insertUsers(db, `user-${userId}`, "Owner", { id: userId, } as never,);
    const actorId = uid();
    await insertActors(db, "Luna", {
      id: actorId,
      actor_type: ActorType.Character,
      agent_type: AgentType.Ai,
    },);

    return { db, userId, actorId, };
  }

  /** Create a world and one location in it (satisfies chats FKs). */
  async function seedWorldLoc(db: Kysely<DB>, userId: string,): Promise<{ worldId: string; locId: string }> {
    const worldId = uid();
    await insertWorlds(db, userId, "Test World", { id: worldId, },);
    const locId = uid();
    await insertLocations(db, worldId, "Test Loc", { id: locId, },);
    return { worldId, locId, };
  }

  test("returns impersonated actor ids from chats in the same world+location scope", async () => {
    const { db, userId, actorId, } = await seed();
    try {
      const { worldId, locId, } = await seedWorldLoc(db, userId,);
      const chatA = uid();
      const chatB = uid();
      await insertChats(db, "A", userId, {
        id: chatA,
        type: ChatType.Group,
        world_id: worldId,
        current_location_id: locId,
      },);

      await insertChats(db, "B", userId, {
        id: chatB,
        type: ChatType.Group,
        world_id: worldId,
        current_location_id: locId,
      },);

      await insertChatParticipants(db, chatA, actorId, {
        impersonate_actor_id: actorId,
      },);

      // Second participant in chat B impersonates nobody.
      await insertChatParticipants(db, chatB, actorId,);

      const ids = await fetchImpersonatedActorIds(db, chatA,);
      expect(ids.has(actorId,),).toBe(true,);
    } finally {
      await db.destroy();
    }
  });

  test("scope excludes chats outside the location, and detached chats fall back to self", async () => {
    const { db, userId, actorId, } = await seed();
    try {
      const { worldId, locId, } = await seedWorldLoc(db, userId,);
      const farLocId = uid();
      const here = uid();
      const elsewhere = uid();
      const detached = uid();
      await insertChats(db, "Here", userId, {
        id: here,
        type: ChatType.Group,
        world_id: worldId,
        current_location_id: locId,
      },);

      await insertLocations(db, worldId, "Far Loc", { id: farLocId, },);
      await insertChats(db, "Elsewhere", userId, {
        id: elsewhere,
        type: ChatType.Group,
        world_id: worldId,
        current_location_id: farLocId,
      },);

      await insertChats(db, "Detached", userId, {
        id: detached,
        type: ChatType.Group,
      },);

      await insertChatParticipants(db, elsewhere, actorId, { impersonate_actor_id: actorId, },);
      await insertChatParticipants(db, detached, actorId, { impersonate_actor_id: actorId, },);

      // Same world, different location: not in "here"'s scope...
      expect((await fetchImpersonatedActorIds(db, here,)).has(actorId,),).toBe(false,);
      // ...but a world-less chat scopes to itself and does see its own row.
      expect((await fetchImpersonatedActorIds(db, detached,)).has(actorId,),).toBe(true,);
    } finally {
      await db.destroy();
    }
  });

  test("no impersonation anywhere yields an empty set", async () => {
    const { db, userId, actorId, } = await seed();
    try {
      const chatId = uid();
      await insertChats(db, "Plain", userId, { id: chatId, type: ChatType.Group, },);
      await insertChatParticipants(db, chatId, actorId,);
      const ids = await fetchImpersonatedActorIds(db, chatId,);
      expect(ids.size,).toBe(0,);
    } finally {
      await db.destroy();
    }
  });
});
