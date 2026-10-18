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
import { insertActors, insertChats, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { itemCreationTool, } from "./create-item";

describe("create_item tool", () => {
  let db: Kysely<DB>;
  const userId = crypto.randomUUID();
  const actorId = crypto.randomUUID();
  const rivalUserId = crypto.randomUUID();

  beforeEach(async () => {
    const fresh = await createTestDb();
    db = fresh.db;
    await insertUsers(db, `owner-${userId}`, "Owner", { id: userId, } as never,);
    await insertWorlds(db, userId, "world-a", { id: "world-a", } as never,);
    await insertWorlds(db, userId, "chat-world", { id: "chat-world", } as never,);
    await insertWorlds(db, userId, "default", { id: "default", } as never,);
    // A world owned by somebody else: the model must not be able to name it.
    await insertUsers(db, `rival-${userId}`, "Rival", { id: rivalUserId, } as never,);
    await insertWorlds(db, rivalUserId, "rival-world", { id: "rival-world", } as never,);
    await insertActors(db, "Generator", { id: actorId, user_id: userId, } as never,);
  },);

  afterEach(async () => {
    await db?.destroy();
  },);

  test("creates an item in the chat's world with defaults", async () => {
    await insertChats(db, "World chat", userId, { id: "chat-1", world_id: "world-a", } as never,);
    const result = await itemCreationTool.handler(
      { name: "Iron Sword", description: "A reliable blade.", },
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
    await insertChats(db, "World chat", userId, { id: "chat-1", world_id: "world-a", } as never,);
    const result = await itemCreationTool.handler(
      { name: "Potion", category: "consumable", rarity: "rare", stackable: "stackable", },
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
    await insertChats(db, "World chat", userId, { id: "chat-1", world_id: "world-a", } as never,);
    const result = await itemCreationTool.handler(
      {
        name: "Mystery",
        category: "not-a-category",
        rarity: "not-a-rarity",
        stackable: "not-a-state",
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

  test("resolves world from the generating chat", async () => {
    await insertChats(db, "World chat", userId, { id: "chat-1", world_id: "chat-world", } as never,);
    const result = await itemCreationTool.handler(
      { name: "Scroll", },
      { db, actorId, chatId: "chat-1", },
    );

    expect(JSON.parse(result.content,),).toMatchObject({ ok: true, worldId: "chat-world", },);
  });

  test("rejects missing name", async () => {
    await insertChats(db, "World chat", userId, { id: "chat-1", world_id: "world-a", } as never,);
    const result = await itemCreationTool.handler(
      { description: "no name", },
      { db, actorId, chatId: "chat-1", },
    );

    expect(result.isError,).toBe(true,);
    expect(await db.selectFrom("items",).select("id",).execute(),).toHaveLength(0,);
  });

  test("fails without execution context", async () => {
    const result = await itemCreationTool.handler({ name: "Scroll", }, undefined,);
    expect(result.isError,).toBe(true,);
  });

  // ── BUG-llm-chosen-worldid-cross-world-write ───────────────
  //
  // `worldId` used to be a declared tool parameter that `resolveWorldId`
  // returned verbatim, so a model steered by a user could plant an item in any
  // world in the deployment. The parameter is gone from the schema and the
  // chat's own world is the only source; these two cases pin both halves.
  test("a model-supplied worldId cannot move the write into another world", async () => {
    await insertChats(db, "World chat", userId, { id: "chat-1", world_id: "world-a", } as never,);

    const result = await itemCreationTool.handler(
      // `additionalProperties: false` is a hint to the model, not a filter:
      // the argument reaches the handler either way.
      { name: "Trojan Blade", worldId: "rival-world", },
      { db, actorId, chatId: "chat-1", },
    );

    expect(JSON.parse(result.content,),).toMatchObject({ ok: true, worldId: "world-a", },);
    expect(await db.selectFrom("items",).select("world_id",).execute(),).toEqual([{ world_id: "world-a", },],);
  });

  test("a chat bound to a world the actor cannot access is refused", async () => {
    await insertChats(db, "Rival chat", userId, { id: "chat-1", world_id: "rival-world", } as never,);

    const result = await itemCreationTool.handler({ name: "Trojan Blade", }, { db, actorId, chatId: "chat-1", },);

    expect(result.isError,).toBe(true,);
    expect(await db.selectFrom("items",).select("id",).execute(),).toHaveLength(0,);
  });
});
