// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Migration 070 — nullable `messages.outfit_id` column.
 *
 * Column exists, is nullable, and a message inserted without it stores null.
 * Lives in `src/db/` beside 045, NOT in `src/db/migrations/`: the loader
 * scans that directory and would register a colocated test as a migration.
 */
import { describe, expect, test, } from "bun:test";
import { type Kysely, sql, } from "kysely";

import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertChats, insertMessages, insertUsers, } from "../test-utils/insert-helpers";
import { down, up, } from "./migrations/070_messages_outfit_id";
import type { DB, } from "./schema";

/** `up`/`down` are typed against the untyped handle the migrator passes them. */
type UntypedDb = Kysely<unknown>;

interface PragmaCol {
  name: string;
  notnull: number;
}

/**
 * @param db
 * @returns the messages.outfit_id column descriptor, or undefined
 */
async function outfitColumn(db: Kysely<DB>,): Promise<PragmaCol | undefined> {
  const rows = await sql<PragmaCol>`PRAGMA table_info(messages)`.execute(db,);
  return rows.rows.find((c,) => c.name === "outfit_id");
}

describe("070_messages_outfit_id", () => {
  test("column exists and is nullable after up", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const col = await outfitColumn(db,);
      expect(col,).toBeDefined();
      expect(col!.notnull,).toBe(0,);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  test("message without outfit stores null", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const userId = await insertUsers(db, `outfit-${crypto.randomUUID()}`, "Outfit",);
      const actorId = await insertActors(db, "Outfit Actor", { user_id: userId, },);
      const chatId = await insertChats(db, "Outfit Chat", userId,);
      const id = await insertMessages(db, chatId, actorId, "user", "hello",);
      const row = await db.selectFrom("messages",).select("outfit_id",).where("id", "=", id,).executeTakeFirstOrThrow();
      expect(row.outfit_id,).toBeNull();
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  test("down drops the column, up restores it", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await down(db as unknown as UntypedDb,);
      expect(await outfitColumn(db,),).toBeUndefined();
      await up(db as unknown as UntypedDb,);
      expect(await outfitColumn(db,),).toBeDefined();
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });
});
