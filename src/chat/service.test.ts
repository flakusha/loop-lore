import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActorMemories,
  insertActors,
  insertUsers,
} from "../test-utils/insert-helpers";
import { createChat, } from "./service";

describe("createChat memory carry", () => {
  let db: Kysely<DB>;

  beforeEach(async () => {
    const fresh = await createTestDb();
    db = fresh.db;
    // user + character actor
    await insertUsers(db, "creator", "Creator", { id: "user-create", } as never,);
    // Owner must also exist as an actor (chat_participants.actor_id → actors.id).
    await insertActors(
      db,
      "Creator",
      { id: "user-create", user_id: "user-create", owner_id: "user-create", } as never,
    );
    await insertActors(db, "Alice", { id: "actor-alice", user_id: "user-create", owner_id: "user-create", } as never,);
    await insertActors(db, "Bob", { id: "actor-bob", user_id: "user-create", owner_id: "user-create", } as never,);
  },);

  afterEach(async () => {
    await db?.destroy();
  },);

  async function seedMemories(contentById: Record<string, string>,): Promise<string[]> {
    const ids: string[] = [];
    for (const [id, content,] of Object.entries(contentById,)) {
      await insertActorMemories(db, "actor-alice", content, { id, importance: 1, } as never,);
      ids.push(id,);
    }
    return ids;
  }

  async function carriedForChat(chatId: string,): Promise<{ id: string; content: string }[]> {
    return db
      .selectFrom("actor_memories",)
      .select(["id", "content",],)
      .where("source_chat_id", "=", chatId,)
      .execute();
  }

  it("carries nothing when memoryCarry is absent", async () => {
    const ids = await seedMemories({ "mem-none-1": "persistent fact A", },);
    const chatId = await createChat(db, {
      name: "No carry",
      createdBy: "user-create",
      participantIds: ["actor-alice",],
    },);
    expect(await carriedForChat(chatId,),).toEqual([],);
    expect(ids,).toHaveLength(1,);
  });

  it("carries nothing when memoryCarry is fresh", async () => {
    await seedMemories({ "mem-fresh-1": "do not carry", },);
    const chatId = await createChat(db, {
      name: "Fresh",
      createdBy: "user-create",
      participantIds: ["actor-alice",],
      memoryCarry: "fresh",
    },);
    expect(await carriedForChat(chatId,),).toEqual([],);
  });

  it("carries all of the participant actor's memories on full", async () => {
    await seedMemories({ "mem-full-1": "fact one", "mem-full-2": "fact two", },);
    const chatId = await createChat(db, {
      name: "Full carry",
      createdBy: "user-create",
      participantIds: ["actor-alice",],
      memoryCarry: "full",
    },);
    const carried = await carriedForChat(chatId,);
    expect(carried.map((m,) => m.content).sort((a, b,) => a.localeCompare(b,)),).toEqual(["fact one", "fact two",],);
  });

  it("carries only the selected ids on selective", async () => {
    await seedMemories({ "mem-sel-1": "keep this", "mem-sel-2": "skip this", },);
    const chatId = await createChat(db, {
      name: "Selective carry",
      createdBy: "user-create",
      participantIds: ["actor-alice",],
      memoryCarry: "selective",
      memoryCarryIds: ["mem-sel-1",],
    },);
    const carried = await carriedForChat(chatId,);
    expect(carried.map((m,) => m.content),).toEqual(["keep this",],);
  });

  it("carries nothing for selective with no matching ids", async () => {
    await seedMemories({ "mem-sel-none-1": "unselected", },);
    const chatId = await createChat(db, {
      name: "Selective empty",
      createdBy: "user-create",
      participantIds: ["actor-alice",],
      memoryCarry: "selective",
      memoryCarryIds: ["does-not-exist",],
    },);
    expect(await carriedForChat(chatId,),).toEqual([],);
  });

  it("selective ids are scoped to the participant actor", async () => {
    // A memory owned by another actor with one of the requested ids must not leak.
    await insertActorMemories(db, "actor-bob", "bob's secret", { id: "mem-bob-1", importance: 1, } as never,);
    const chatId = await createChat(db, {
      name: "Selective scoped",
      createdBy: "user-create",
      participantIds: ["actor-alice",],
      memoryCarry: "selective",
      memoryCarryIds: ["mem-bob-1",],
    },);
    expect(await carriedForChat(chatId,),).toEqual([],);
  });

  it("carried memories target the new chat as source_chat_id", async () => {
    await seedMemories({ "mem-src-1": "context", },);
    const chatId = await createChat(db, {
      name: "Source scoped",
      createdBy: "user-create",
      participantIds: ["actor-alice",],
      memoryCarry: "full",
    },);
    const rows = await db
      .selectFrom("actor_memories",)
      .select(["source_chat_id",],)
      .where("content", "=", "context",)
      .execute();
    expect(rows.some((r,) => r.source_chat_id === chatId),).toBe(true,);
  });

  it("creates owner + member participants alongside carry", async () => {
    const chatId = await createChat(db, {
      name: "Participants",
      createdBy: "user-create",
      participantIds: ["actor-alice",],
      memoryCarry: "fresh",
    },);
    const participants = await db
      .selectFrom("chat_participants",)
      .select(["actor_id", "role_in_chat",],)
      .where("chat_id", "=", chatId,)
      .execute();
    expect(participants,).toContainEqual({ actor_id: "user-create", role_in_chat: "owner", },);
    expect(participants,).toContainEqual({ actor_id: "actor-alice", role_in_chat: "member", },);
  });
});
