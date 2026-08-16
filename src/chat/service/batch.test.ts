/**
 * Tests for batch chat operations (archive / delete / export).
 *
 * All three functions scope to chats the user owns (`created_by = userId`):
 * foreign chats are never touched, and empty ownership yields empty results.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActorMemories,
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { batchArchiveChats, batchDeleteChats, batchExportChats, } from "./batch";

describe("batch chat operations", () => {
  let db: Kysely<DB>;
  const ownerId: string = crypto.randomUUID();
  const otherId: string = crypto.randomUUID();
  const ownerActorId: string = crypto.randomUUID();
  const otherActorId: string = crypto.randomUUID();
  const ownedChat = crypto.randomUUID();
  const ownedChat2 = crypto.randomUUID();
  const foreignChat = crypto.randomUUID();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    await insertUsers(db, `owner-${ownerId}`, "Owner", { id: ownerId, } as never,);
    await insertUsers(db, `other-${otherId}`, "Other", { id: otherId, } as never,);
    await insertActors(db, "Owner Actor", { id: ownerActorId, user_id: ownerId, owner_id: ownerId, } as never,);
    await insertActors(db, "Other Actor", { id: otherActorId, user_id: otherId, owner_id: otherId, } as never,);

    await insertChats(db, "Owned", ownerId, { id: ownedChat, } as never,);
    await insertChats(db, "Owned 2", ownerId, { id: ownedChat2, } as never,);
    await insertChats(db, "Foreign", otherId, { id: foreignChat, } as never,);

    await insertChatParticipants(db, ownedChat, ownerActorId, {},);
    await insertChatParticipants(db, foreignChat, otherActorId, {},);

    await insertMessages(db, ownedChat, ownerActorId, MessageRole.User, "owned msg", {},);
    await insertMessages(db, foreignChat, otherActorId, MessageRole.User, "foreign msg", {},);
    await insertActorMemories(db, ownerActorId, "memory from owned chat", {
      source_chat_id: ownedChat,
    },);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  describe("batchArchiveChats", () => {
    test("archives owned chats and returns their ids", async () => {
      const archived = await batchArchiveChats(db, [ownedChat, ownedChat2,], ownerId,);
      expect([...archived,].sort(),).toEqual([ownedChat, ownedChat2,].sort(),);

      const rows = await db
        .selectFrom("chats",)
        .select(["id", "is_pinned",],)
        .where("id", "in", [ownedChat, ownedChat2,],)
        .execute();
      for (const row of rows) {
        expect(row.is_pinned,).toBe("archived",);
      }
    });

    test("skips chats owned by other users", async () => {
      const archived = await batchArchiveChats(db, [foreignChat,], ownerId,);
      expect(archived,).toEqual([],);

      const row = await db
        .selectFrom("chats",)
        .select("is_pinned",)
        .where("id", "=", foreignChat,)
        .executeTakeFirst();
      expect(row?.is_pinned,).not.toBe("archived",);
    });

    test("returns empty for an empty id list", async () => {
      const archived = await batchArchiveChats(db, [], ownerId,);
      expect(archived,).toEqual([],);
    });
  });

  describe("batchDeleteChats", () => {
    test("deletes owned chats with their messages, participants, and carried memories", async () => {
      const deleted = await batchDeleteChats(db, [ownedChat,], ownerId,);
      expect(deleted,).toBe(1,);

      expect(await chatExists(db, ownedChat,),).toBe(false,);
      expect(await countRows(db, "messages", "chat_id", ownedChat,),).toBe(0,);
      expect(await countRows(db, "chat_participants", "chat_id", ownedChat,),).toBe(0,);
      expect(await countRows(db, "actor_memories", "source_chat_id", ownedChat,),).toBe(0,);
    });

    test("leaves foreign chats untouched and returns 0", async () => {
      const deleted = await batchDeleteChats(db, [foreignChat,], ownerId,);
      expect(deleted,).toBe(0,);
      expect(await chatExists(db, foreignChat,),).toBe(true,);
    });
  });

  describe("batchExportChats", () => {
    test("returns null when none of the chats are owned", async () => {
      const exported = await batchExportChats(db, [foreignChat,], ownerId,);
      expect(exported,).toBeNull();
    });

    test("exports owned chats with messages and participants", async () => {
      const exported = await batchExportChats(db, [ownedChat2,], ownerId,);
      expect(exported,).not.toBeNull();
      expect(exported,).toHaveLength(1,);

      const entry = exported?.[0];
      expect(entry?.chat,).toBeDefined();
      expect((entry?.chat as { id: string }).id,).toBe(ownedChat2,);
      expect(entry?.messages,).toBeInstanceOf(Array,);
      expect(entry?.participants,).toBeInstanceOf(Array,);
    });

    test("ignores foreign chats in a mixed id list", async () => {
      const exported = await batchExportChats(db, [ownedChat2, foreignChat,], ownerId,);
      expect(exported,).not.toBeNull();
      expect(exported,).toHaveLength(1,);
      expect((exported?.[0]?.chat as { id: string }).id,).toBe(ownedChat2,);
    });
  });
});

async function chatExists(db: Kysely<DB>, chatId: string,): Promise<boolean> {
  const row = await db.selectFrom("chats",).select("id",).where("id", "=", chatId,).executeTakeFirst();
  return row !== undefined;
}

async function countRows(
  db: Kysely<DB>,
  table: "messages" | "chat_participants" | "actor_memories",
  column: "chat_id" | "source_chat_id",
  value: string,
): Promise<number> {
  const row = await db
    .selectFrom(table,)
    .select(db.fn.countAll().as("count",),)
    .where(column, "=", value,)
    .executeTakeFirst();
  return Number(row?.count ?? 0,);
}
