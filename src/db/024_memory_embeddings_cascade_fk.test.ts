// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Deleting a memory must delete its vector row. Before 024 there was no FK,
 * `deleteEmbedding()` was only ever called from its own test, and every deleted
 * memory leaked a 1536-dim blob.
 *
 * The interesting cases are the ones a per-call-site fix would miss: the chat
 * delete paths remove memories by `source_chat_id`, not by `memory_id`.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActorMemories, insertActors, insertChats, insertUsers, } from "../test-utils/insert-helpers";
import { up, } from "./migrations/024_memory_embeddings_cascade_fk";
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

  // The migration is also a one-time cleanup: databases upgrading from the
  // pre-024 shape already hold vectors whose memory is long gone, and there is
  // no parent row to cascade from. Those rows must be dropped by the rebuild,
  // not carried into the FK-enforced table where they would fail the constraint.
  //
  // This calls `up` directly rather than going through a Migrator: a
  // migrateDown() would run 024's own `down`, which drops the table and so
  // would clear the planted orphan before `up` ever saw it -- the assertion
  // would pass no matter what `up` did with orphans.
  test("up drops pre-existing orphans instead of carrying them into the FK table", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      // Back to the pre-024 shape (no FK) and plant a row with no parent.
      sqlite.run("DROP TABLE memory_embeddings",);
      sqlite.run(
        `CREATE TABLE memory_embeddings (
           memory_id TEXT PRIMARY KEY,
           model TEXT NOT NULL DEFAULT 'nomic-embed-text',
           dimensions INTEGER NOT NULL DEFAULT 1536,
           vector_blob BLOB NOT NULL,
           created_at INTEGER NOT NULL
         )`,
      );

      sqlite.run(
        "INSERT INTO memory_embeddings (memory_id, vector_blob, created_at) VALUES (?, ?, ?)",
        ["orphan-mem", vec, Date.now(),],
      );

      expect(await embeddingIds(db,),).toEqual(["orphan-mem",],);

      await up(db as unknown as Kysely<unknown>,);

      // Gone, and the rebuilt table enforces the FK.
      expect(await embeddingIds(db,),).toEqual([],);
      expect(() => {
        sqlite.run(
          "INSERT INTO memory_embeddings (memory_id, vector_blob, created_at) VALUES (?, ?, ?)",
          ["orphan-mem-2", vec, Date.now(),],
        );
      },).toThrow();
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });
});
