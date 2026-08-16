// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * create_item tool — handler tests.
 *
 * Verifies the builtin item-creation wizard: inserts an items row world-scoped
 * with category/rarity/stackable validation and defaults; resolves world id
 * from explicit param or chat; rejects missing name and context.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { itemCreationTool, } from "./create-item";

describe("create_item tool", () => {
  let db: Kysely<DB>;
  const userId = crypto.randomUUID();
  const actorId = crypto.randomUUID();

  beforeEach(async () => {
    const fresh = await createTestDb();
    db = fresh.db;
    await insertUsers(db, `owner-${userId}`, "Owner", { id: userId, } as never,);
    await insertWorlds(db, userId, "world-a", { id: "world-a", } as never,);
    await insertWorlds(db, userId, "chat-world", { id: "chat-world", } as never,);
    await insertWorlds(db, userId, "default", { id: "default", } as never,);
  },);

  afterEach(async () => {
    await db?.destroy();
  },);

  test("creates an item in an explicitly provided world with defaults", async () => {
    const result = await itemCreationTool.handler(
      { name: "Iron Sword", description: "A reliable blade.", worldId: "world-a", },
      { db, actorId, chatId: "chat-1", },
    );
    expect(result.isError,).not.toBe(true,);
    expect(JSON.parse(result.content,),).toMatchObject({ ok: true, worldId: "world-a", },);

    const row = await db
      .selectFrom("items",)
      .selectAll()
      .where("name", "=", "Iron Sword",)
      .executeTakeFirstOrThrow();
    expect(row.world_id,).toBe("world-a",);
    expect(row.category,).toBe("other",);
    expect(row.rarity,).toBe("common",);
    expect(row.stackable,).toBe("unique",);
    expect(row.description,).toBe("A reliable blade.",);
  });

  test("honors explicit category/rarity/stackable", async () => {
    const result = await itemCreationTool.handler(
      { name: "Potion", category: "consumable", rarity: "rare", stackable: "stackable", worldId: "world-a", },
      { db, actorId, chatId: "chat-1", },
    );
    expect(JSON.parse(result.content,),).toMatchObject({ ok: true, },);

    const row = await db
      .selectFrom("items",)
      .select(["category", "rarity", "stackable",],)
      .where("name", "=", "Potion",)
      .executeTakeFirstOrThrow();
    expect(row.category,).toBe("consumable",);
    expect(row.rarity,).toBe("rare",);
    expect(row.stackable,).toBe("stackable",);
  });

  test("falls back to defaults for invalid enum values", async () => {
    const result = await itemCreationTool.handler(
      {
        name: "Mystery",
        category: "not-a-category",
        rarity: "not-a-rarity",
        stackable: "not-a-state",
        worldId: "world-a",
      },
      { db, actorId, chatId: "chat-1", },
    );
    expect(JSON.parse(result.content,),).toMatchObject({ ok: true, },);

    const row = await db
      .selectFrom("items",)
      .select(["category", "rarity", "stackable",],)
      .where("name", "=", "Mystery",)
      .executeTakeFirstOrThrow();
    expect(row.category,).toBe("other",);
    expect(row.rarity,).toBe("common",);
    expect(row.stackable,).toBe("unique",);
  });

  test("resolves world from the generating chat when no explicit world", async () => {
    await insertChats(db, "World chat", userId, { id: "chat-1", world_id: "chat-world", } as never,);
    const result = await itemCreationTool.handler(
      { name: "Scroll", },
      { db, actorId, chatId: "chat-1", },
    );
    expect(JSON.parse(result.content,),).toMatchObject({ ok: true, worldId: "chat-world", },);
  });

  test("rejects missing name", async () => {
    const result = await itemCreationTool.handler(
      { description: "no name", worldId: "world-a", },
      { db, actorId, chatId: "chat-1", },
    );
    expect(result.isError,).toBe(true,);
    expect(await db.selectFrom("items",).select("id",).execute(),).toHaveLength(0,);
  });

  test("fails without execution context", async () => {
    const result = await itemCreationTool.handler({ name: "Scroll", }, undefined,);
    expect(result.isError,).toBe(true,);
  });
});
