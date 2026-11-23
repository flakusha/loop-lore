// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory-embedding FK cascade oracle against the final consolidated schema.
 * `memory_embeddings.memory_id` is a FK to `actor_memories.id` with ON DELETE
 * CASCADE (owned by 003_actors), so deleting a memory removes its vector row.
 *
 * The interesting cases are the ones a per-call-site fix would miss: the chat
 * delete paths remove memories by `source_chat_id`, not by `memory_id`.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActorMemories, insertActors, insertChats, insertUsers, } from "../test-utils/insert-helpers";
import type { DB, } from "./schema";

const vec = new Uint8Array(1536 * 4,).fill(7,);

/**
 * Two actors, each with one memory and one embedding. Only the first memory has
 * a `source_chat_id` -- that is the shape the chat delete paths target. The
 * chat must be a real row: `actor_memories.source_chat_id` has a FK to `chats`.
 */
async function seed(db: Kysely<DB>,): Promise<{ kept: string; chatId: string }> {
  const userId = await insertUsers(db, `emb-user-${crypto.randomUUID()}`, "Emb",);
  const actorA = await insertActors(db, "A", { user_id: userId, },);
  const actorB = await insertActors(db, "B", { user_id: userId, },);
  const chatId = await insertChats(db, "Chat", userId,);
  const memA = await insertActorMemories(db, actorA, "one", {
    id: `mem-${crypto.randomUUID()}`,
    source_chat_id: chatId,
  },);

  const kept = await insertActorMemories(db, actorB, "two", { id: `mem-${crypto.randomUUID()}`, },);
  await db.insertInto("memory_embeddings",).values({ memory_id: memA, vector_blob: vec, created_at: Date.now(), },)
    .execute();

  await db.insertInto("memory_embeddings",).values({ memory_id: kept, vector_blob: vec, created_at: Date.now(), },)
    .execute();

  return { kept, chatId, };
}

const embeddingIds = (db: Kysely<DB>,): Promise<string[]> =>
  db.selectFrom("memory_embeddings",).select("memory_id",).orderBy("memory_id",).execute().then((r,) =>
    r.map((x,) => x.memory_id)
  );

const chatMemoryId = (db: Kysely<DB>, chatId: string,): Promise<string> =>
  db.selectFrom("actor_memories",).select("id",).where("source_chat_id", "=", chatId,).executeTakeFirst().then((r,) =>
    r!.id
  );

describe("024_memory_embeddings_cascade_fk", () => {
  test("deleting a memory deletes its embedding", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const { kept, chatId, } = await seed(db,);
      await db.deleteFrom("actor_memories",).where("id", "=", await chatMemoryId(db, chatId,),).execute();
      expect(await embeddingIds(db,),).toEqual([kept,],);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  // The chat delete paths filter on source_chat_id, not memory_id, so a
  // per-memory cleanup wired into them would never run for these rows.
  test("deleting by source_chat_id cascades too", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const { kept, chatId, } = await seed(db,);
      await db.deleteFrom("actor_memories",).where("source_chat_id", "=", chatId,).execute();
      expect(await embeddingIds(db,),).toEqual([kept,],);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  test("deleting a different memory leaves the other embedding alone", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const { kept, chatId, } = await seed(db,);
      await db.deleteFrom("actor_memories",).where("id", "=", kept,).execute();
      expect(await embeddingIds(db,),).toEqual([await chatMemoryId(db, chatId,),],);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  // In the final schema the FK is in place from table creation, so no orphan
  // row can exist. Assert the constraint directly: an embedding with no parent
  // memory is rejected, and the FK cascades on delete.
  test("final schema enforces the memory→embedding FK (no orphans)", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const fks = sqlite.query(`PRAGMA foreign_key_list(memory_embeddings)`,).all() as {
        table: string;
        from: string;
        to: string;
        on_delete: string;
      }[];

      expect(fks,).toEqual([
        expect.objectContaining({
          table: "actor_memories",
          from: "memory_id",
          to: "id",
          on_delete: "CASCADE",
        },),
      ],);

      expect(() => {
        sqlite.run(
          "INSERT INTO memory_embeddings (memory_id, vector_blob, created_at) VALUES (?, ?, ?)",
          ["orphan-mem", vec, Date.now(),],
        );
      },).toThrow();
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });
});
