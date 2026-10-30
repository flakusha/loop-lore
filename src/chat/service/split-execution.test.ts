/**
 * Tests for auto-execution of party split / reunion from detected narration.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { ChatParticipantRole, MessageRole, PinnedState, } from "../../db/enums";
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
import {
  deriveSplitBranches,
  executeReuniteFromNarration,
  executeSplitFromNarration,
} from "./split-execution";

const WORLD_ID = "exec-test-world";

/** Narration that names two participants with two resolvable destinations. */
const EXECUTABLE = "Rogue heads to the Forest, Mage goes to the Cave";

describe("split/reunite narration auto-execution (C7 remainder)", () => {
  let db: Kysely<DB>;
  let ownerId: string;
  let rogueId: string;
  let mageId: string;
  const srcChatId = crypto.randomUUID();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    ownerId = crypto.randomUUID();
    rogueId = crypto.randomUUID();
    mageId = crypto.randomUUID();

    await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, } as never,);
    await insertActors(db, "Owner", { id: ownerId, user_id: ownerId, owner_id: ownerId, } as never,);
    await insertActors(db, "Rogue", { id: rogueId, user_id: ownerId, owner_id: ownerId, } as never,);
    await insertActors(db, "Mage", { id: mageId, user_id: ownerId, owner_id: ownerId, } as never,);
    await insertActors(
      db,
      "Narrator",
      {
        id: "narrator",
        user_id: ownerId,
        owner_id: ownerId,
        actor_type: "narrator",
        agent_type: "narrator",
      } as never,
    );

    await db.insertInto("worlds",).values({ id: WORLD_ID, name: "Test World", owner_id: ownerId, },).execute();
    await db.insertInto("locations",).values({ id: "forest", world_id: WORLD_ID, name: "Forest", },).execute();
    await db.insertInto("locations",).values({ id: "cave", world_id: WORLD_ID, name: "Cave", },).execute();

    await insertChats(
      db,
      "Party Camp",
      ownerId,
      { id: srcChatId, world_id: WORLD_ID, } as never,
    );

    for (const actorId of [ownerId, rogueId, mageId,]) {
      await insertChatParticipants(db, srcChatId, actorId, {
        role_in_chat: actorId === ownerId ? ChatParticipantRole.Owner : ChatParticipantRole.Member,
      } as never,);
    }
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  describe("deriveSplitBranches", () => {
    test("derives a branch per participant clause with a resolvable destination", async () => {
      const branches = await deriveSplitBranches(db, {
        chatId: srcChatId,
        narration: EXECUTABLE,
        worldId: WORLD_ID,
      },);

      expect(branches,).not.toBeNull();
      expect(branches,).toHaveLength(2,);
      expect(branches?.[0],).toEqual({ actorIds: [rogueId,], locationId: "forest", name: "Forest", },);
      expect(branches?.[1],).toEqual({ actorIds: [mageId,], locationId: "cave", name: "Cave", },);
    });

    test("returns null when no destinations resolve", async () => {
      const branches = await deriveSplitBranches(db, {
        chatId: srcChatId,
        narration: "We split up at the crossroads.",
        worldId: WORLD_ID,
      },);

      expect(branches,).toBeNull();
    });

    test("returns null when only one executable branch results", async () => {
      const branches = await deriveSplitBranches(db, {
        chatId: srcChatId,
        narration: "Rogue heads to the Forest while the others stay put.",
        worldId: WORLD_ID,
      },);

      expect(branches,).toBeNull();
    });
  });

  describe("executeSplitFromNarration", () => {
    test("executes splitParty with derived specs", async () => {
      await executeSplitFromNarration(db, { chatId: srcChatId, actorId: ownerId, narration: EXECUTABLE, },);

      const children = await db
        .selectFrom("chats",)
        .selectAll()
        .where("parent_chat_id", "=", srcChatId,)
        .execute();

      expect(children,).toHaveLength(2,);
      const byLocation = new Map(children.map(c => [c.current_location_id, c,]),);
      expect(byLocation.get("forest",)?.parent_chat_id,).toBe(srcChatId,);
      expect(byLocation.get("cave",)?.parent_chat_id,).toBe(srcChatId,);

      for (const child of children) {
        const participants = await db
          .selectFrom("chat_participants",)
          .select("actor_id",)
          .where("chat_id", "=", child.id,)
          .execute();

        const expected = child.current_location_id === "forest" ? [rogueId,] : [mageId,];
        expect(participants.map(p => p.actor_id).sort(),).toEqual([...expected,].sort(),);
      }
    });

    test("skips execution when narration yields no branch specs", async () => {
      await executeSplitFromNarration(db, {
        chatId: srcChatId,
        actorId: ownerId,
        narration: "We split up at the crossroads.",
      },);

      const children = await db
        .selectFrom("chats",)
        .select("id",)
        .where("parent_chat_id", "=", srcChatId,)
        .execute();

      expect(children,).toHaveLength(2,);
    });
  });

  describe("executeReuniteFromNarration", () => {
    test("merges the most recent active branch back into the primary chat", async () => {
      const branchChatId = crypto.randomUUID();
      await insertChats(
        db,
        "Forest branch",
        ownerId,
        {
          id: branchChatId,
          parent_chat_id: srcChatId,
          world_id: WORLD_ID,
          updated_at: "2099-01-01T00:00:00.000Z",
        } as never,
      );

      await insertChatParticipants(db, branchChatId, rogueId, { role_in_chat: ChatParticipantRole.Member, } as never,);
      await insertMessages(db, branchChatId, rogueId, MessageRole.User, "The forest is quiet.",);

      await executeReuniteFromNarration(db, { chatId: srcChatId, actorId: ownerId, },);

      const merged = await db
        .selectFrom("messages",)
        .selectAll()
        .where("chat_id", "=", srcChatId,)
        .execute();

      expect(merged.some(m => m.content === "The forest is quiet."),).toBe(true,);

      const branchRow = await db
        .selectFrom("chats",)
        .select("is_pinned",)
        .where("id", "=", branchChatId,)
        .executeTakeFirst();

      expect(branchRow?.is_pinned,).toBe(PinnedState.Archived,);

      const mergedParticipants = await db
        .selectFrom("chat_participants",)
        .select("actor_id",)
        .where("chat_id", "=", srcChatId,)
        .execute();

      expect(mergedParticipants.some(p => p.actor_id === rogueId),).toBe(true,);
    });
  });
});
