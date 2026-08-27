/**
 * Tests for party split / reunion (C7 Phase 3 — group-chat VN party migration).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { ChatParticipantRole, MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { reuniteChats, splitParty, } from "./split";

describe("party split / reunion (C7 Phase 3)", () => {
  let db: Kysely<DB>;
  let ownerId: string;
  let heroId: string;
  let rogueId: string;
  let mageId: string;
  const srcChatId = crypto.randomUUID();
  const missingChatId = "missing-chat";

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    ownerId = crypto.randomUUID();
    heroId = crypto.randomUUID();
    rogueId = crypto.randomUUID();
    mageId = crypto.randomUUID();

    await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, } as never,);
    await insertActors(db, "Owner", { id: ownerId, user_id: ownerId, owner_id: ownerId, } as never,);
    await insertActors(db, "Hero", { id: heroId, user_id: ownerId, owner_id: ownerId, } as never,);
    await insertActors(db, "Rogue", { id: rogueId, user_id: ownerId, owner_id: ownerId, } as never,);
    await insertActors(db, "Mage", { id: mageId, user_id: ownerId, owner_id: ownerId, } as never,);
    // system actor required by injectNarration (messages.actor_id FK → actors.id)
    await insertActors(db, "System", { id: "system", } as never,);

    await insertChats(
      db,
      "Party Dungeon",
      ownerId,
      { id: srcChatId, type: "group", mode: "group", visual_novel: 1, } as never,
    );

    await insertChatParticipants(db, srcChatId, ownerId, {
      role_in_chat: ChatParticipantRole.Owner,
    } as never,);
    await insertChatParticipants(db, srcChatId, heroId, {
      role_in_chat: ChatParticipantRole.Member,
    } as never,);
    await insertChatParticipants(db, srcChatId, rogueId, {
      role_in_chat: ChatParticipantRole.Member,
    } as never,);
    await insertChatParticipants(db, srcChatId, mageId, {
      role_in_chat: ChatParticipantRole.Member,
    } as never,);

    // Insert world + locations referenced by branch current_location_id FK
    const worldId = "test-world";
    await db.insertInto("worlds",).values({ id: worldId, name: "Test World", owner_id: ownerId, },).execute();
    await db.insertInto("locations",).values({ id: "forest", world_id: worldId, name: "Forest", },).execute();
    await db.insertInto("locations",).values({ id: "cave", world_id: worldId, name: "Cave", },).execute();
    await db.insertInto("locations",).values({ id: "tower", world_id: worldId, name: "Tower", },).execute();
    await db.insertInto("locations",).values({ id: "dungeon", world_id: worldId, name: "Dungeon", },)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  describe("splitParty", () => {
    test("splits party into two branches with correct participants", async () => {
      const result = await splitParty(db, {
        chatId: srcChatId,
        actorId: ownerId,
        branches: [
          { locationId: "forest", actorIds: [heroId,], name: "Forest Team", },
          { locationId: "cave", actorIds: [rogueId, mageId,], name: "Cave Team", },
        ],
      },);

      if ("code" in result) {
        throw new Error(`Unexpected error: ${result.code} ${result.message}`,);
      }

      expect(result.ok,).toBe(true,);
      expect(result.branches,).toHaveLength(2,);
      expect(result.splitNarration,).toContain("splits",);

      const forestChat = await db
        .selectFrom("chats",)
        .select(["id", "current_location_id",],)
        .where("id", "=", result.branches[0]!.chatId,)
        .executeTakeFirst();
      expect(forestChat?.current_location_id,).toBe("forest",);
      expect(result.branches[0]!.participantCount,).toBe(1,);

      const caveChat = await db
        .selectFrom("chats",)
        .select(["id", "current_location_id",],)
        .where("id", "=", result.branches[1]!.chatId,)
        .executeTakeFirst();
      expect(caveChat?.current_location_id,).toBe("cave",);
      expect(result.branches[1]!.participantCount,).toBe(2,);
    });

    test("returns bad_request when fewer than two branches", async () => {
      const result = await splitParty(db, {
        chatId: srcChatId,
        actorId: ownerId,
        branches: [{ locationId: "forest", actorIds: [heroId,], name: "Solo", },],
      },);

      expect(result,).toEqual({
        code: "bad_request",
        message: "At least two branches are required",
      },);
    });

    test("returns not_found for missing chat", async () => {
      const result = await splitParty(db, {
        chatId: missingChatId,
        actorId: ownerId,
        branches: [
          { locationId: "a", actorIds: [heroId,], name: "A", },
          { locationId: "b", actorIds: [rogueId,], name: "B", },
        ],
      },);

      expect(result,).toEqual({
        code: "not_found",
        message: "Chat not found",
      },);
    });

    test("returns forbidden when actor is not the chat owner", async () => {
      const result = await splitParty(db, {
        chatId: srcChatId,
        actorId: heroId,
        branches: [
          { locationId: "a", actorIds: [heroId,], name: "A", },
          { locationId: "b", actorIds: [rogueId,], name: "B", },
        ],
      },);

      expect(result,).toEqual({
        code: "forbidden",
        message: "Only the chat owner can split the party",
      },);
    });
  });

  describe("reuniteChats", () => {
    test("merges messages from secondary into primary and deduplicates participants", async () => {
      const splitResult = await splitParty(db, {
        chatId: srcChatId,
        actorId: ownerId,
        branches: [
          { locationId: "tower", actorIds: [heroId,], name: "Tower Team", },
          { locationId: "dungeon", actorIds: [rogueId, mageId,], name: "Dungeon Team", },
        ],
      },);

      if ("code" in splitResult) {
        throw new Error(`Split setup failed: ${splitResult.code}`,);
      }

      const primaryId = splitResult.branches[0]!.chatId;
      const secondaryId = splitResult.branches[1]!.chatId;

      await insertMessages(db, secondaryId, heroId, MessageRole.User, "We found the treasure!",);

      const primaryCountBefore = await db
        .selectFrom("messages",)
        .select("id",)
        .where("chat_id", "=", primaryId,)
        .execute();

      const result = await reuniteChats(db, {
        primaryChatId: primaryId,
        secondaryChatId: secondaryId,
        actorId: ownerId,
      },);

      if ("code" in result) {
        throw new Error(`Unexpected reunion error: ${result.code}`,);
      }

      expect(result.ok,).toBe(true,);
      // mergedMessageCount = all secondary messages (dungeon narration + user message = 2)
      expect(result.mergedMessageCount,).toBe(2,);
      expect(result.reunionNarration,).toContain("reunite",);

      // primaryBefore: tower narration (1) + dungeon narration from split (1) = 2
      // After reunion: tower + dungeon + reunion_narration + user_message_copy = 4
      // Net increase = +2 (reunion_narration + user_message_copy)
      const primaryCountAfter = await db
        .selectFrom("messages",)
        .select("id",)
        .where("chat_id", "=", primaryId,)
        .execute();

      expect(primaryCountAfter.length,).toBe(primaryCountBefore.length + 3,);
    });

    test("returns not_found when primary chat does not exist", async () => {
      const result = await reuniteChats(db, {
        primaryChatId: missingChatId,
        secondaryChatId: srcChatId,
        actorId: ownerId,
      },);

      expect(result,).toEqual({
        code: "not_found",
        message: "Primary chat not found",
      },);
    });

    test("returns forbidden when actor is not the primary chat owner", async () => {
      const result = await reuniteChats(db, {
        primaryChatId: srcChatId,
        secondaryChatId: srcChatId,
        actorId: heroId,
      },);

      expect(result,).toEqual({
        code: "forbidden",
        message: "Only the primary chat owner can initiate a reunion",
      },);
    });

    test("returns forbidden when actor is not the secondary chat owner", async () => {
      // Create a secondary chat owned by a different user
      const otherOwnerId = crypto.randomUUID();
      await insertUsers(db, `owner-${otherOwnerId}`, "Other Owner", { id: otherOwnerId, } as never,);
      await insertActors(
        db,
        "Other Owner",
        { id: otherOwnerId, user_id: otherOwnerId, owner_id: otherOwnerId, } as never,
      );
      const otherChatId = crypto.randomUUID();
      await insertChats(db, "Other Chat", otherOwnerId, { id: otherChatId, type: "group", mode: "group", } as never,);

      const result = await reuniteChats(db, {
        primaryChatId: srcChatId,
        secondaryChatId: otherChatId,
        actorId: ownerId,
      },);

      expect(result,).toEqual({
        code: "forbidden",
        message: "Only the secondary chat owner can initiate a reunion",
      },);
    });
  });
});
