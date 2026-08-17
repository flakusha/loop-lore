/**
 * write_memory_note tool — handler tests.
 *
 * Verifies the builtin memory-write tool: stores durable memories via
 * storeMemories (actor_memories row with source_chat_id), dedupes identical
 * content, validates content/importance/keywords, and requires execution ctx.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { MemoryType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { MEMORY_NOTE_MAX_CHARS, writeMemoryNoteTool, } from "./write-memory-note";

describe("write_memory_note tool", () => {
  let db: Kysely<DB>;
  const userId = crypto.randomUUID();
  const actorId = crypto.randomUUID();
  const chatId = crypto.randomUUID();

  beforeEach(async () => {
    const fresh = await createTestDb();
    db = fresh.db;
    await insertUsers(db, `owner-${userId}`, "Owner", { id: userId, } as never,);
    await insertActors(db, "Alice", { id: actorId, user_id: userId, owner_id: userId, } as never,);
    await insertChats(db, "Memory chat", userId, { id: chatId, } as never,);
    await insertChatParticipants(db, chatId, actorId,);
  },);

  afterEach(async () => {
    await db?.destroy();
  },);

  async function memoryRows(): Promise<{ content: string; source_chat_id: string | null }[]> {
    return db
      .selectFrom("actor_memories",)
      .select(["content", "source_chat_id",],)
      .where("actor_id", "=", actorId,)
      .execute();
  }

  test("stores a memory note for the generating actor + chat", async () => {
    const result = await writeMemoryNoteTool.handler(
      { content: "The keeper drinks only black coffee.", },
      { db, actorId, chatId, },
    );
    expect(result.isError,).not.toBe(true,);
    expect(JSON.parse(result.content,),).toMatchObject({ ok: true, stored: 1, },);

    const rows = await memoryRows();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.content,).toBe("The keeper drinks only black coffee.",);
    expect(rows[0]!.source_chat_id,).toBe(chatId,);
  });

  test("dedupes identical content (stored: 0 on repeat)", async () => {
    await writeMemoryNoteTool.handler({ content: "Repeated fact.", }, { db, actorId, chatId, },);
    const result = await writeMemoryNoteTool.handler({ content: "Repeated fact.", }, { db, actorId, chatId, },);
    expect(JSON.parse(result.content,),).toMatchObject({ ok: true, stored: 0, },);
    expect(await memoryRows(),).toHaveLength(1,);
  });

  test("honors memoryType + importance + keywords params", async () => {
    const result = await writeMemoryNoteTool.handler({
      content: "Semantic rule: never trust the mirror.",
      memoryType: "semantic",
      importance: 0.9,
      keywords: ["mirror", "rule",],
    }, { db, actorId, chatId, },);
    expect(JSON.parse(result.content,),).toMatchObject({ ok: true, stored: 1, memoryType: "semantic", },);
    expect(result.metadata,).toMatchObject({ stored: 1, memoryType: "semantic", },);

    const row = await db
      .selectFrom("actor_memories",)
      .select(["memory_type", "importance", "keywords",],)
      .where("actor_id", "=", actorId,)
      .executeTakeFirstOrThrow();
    expect(row.memory_type,).toBe(MemoryType.Semantic,);
    expect(row.importance,).toBeCloseTo(0.9, 10,);
    expect(JSON.parse(row.keywords as string,),).toEqual(["mirror", "rule",],);
  });

  test("rejects empty content", async () => {
    const result = await writeMemoryNoteTool.handler({ content: " ".repeat(3,), }, { db, actorId, chatId, },);
    expect(result.isError,).toBe(true,);
    expect(await memoryRows(),).toHaveLength(0,);
  });

  test("rejects oversized content", async () => {
    const result = await writeMemoryNoteTool.handler(
      { content: "x".repeat(MEMORY_NOTE_MAX_CHARS + 1,), },
      { db, actorId, chatId, },
    );
    expect(result.isError,).toBe(true,);
  });

  test("fails without execution context", async () => {
    const result = await writeMemoryNoteTool.handler({ content: "no ctx", }, undefined,);
    expect(result.isError,).toBe(true,);
  });
});
