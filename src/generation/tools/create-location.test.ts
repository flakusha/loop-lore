// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * create_location tool — handler tests.
 *
 * Verifies the builtin location-creation wizard: inserts a locations row and
 * auto-creates a bound chat; resolves world id from an explicit param, the
 * generating chat's world, or the default; rejects missing name and context.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChats, insertChatSetupTemplates, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { locationCreationTool, } from "./create-location";

describe("create_location tool", () => {
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
    // Generating actor resolves to `userId`; the user-actor id equivalence
    // lets the bound-chat participant insert (actor_id = owner) succeed.
    await insertActors(db, "Generator", { id: actorId, user_id: userId, owner_id: userId, } as never,);
    await insertActors(db, "OwnerActor", { id: userId, user_id: userId, owner_id: userId, } as never,);
  },);

  afterEach(async () => {
    await db?.destroy();
  },);

  test("creates a location in an explicitly provided world", async () => {
    const result = await locationCreationTool.handler(
      { name: "The Gilded Tavern", description: "A cozy inn.", worldId: "world-a", },
      { db, actorId, chatId: "chat-1", },
    );
    expect(result.isError,).not.toBe(true,);
    expect(JSON.parse(result.content,),).toMatchObject({ ok: true, worldId: "world-a", },);

    const row = await db
      .selectFrom("locations",)
      .selectAll()
      .where("name", "=", "The Gilded Tavern",)
      .executeTakeFirstOrThrow();
    expect(row.world_id,).toBe("world-a",);
    expect(row.description,).toBe("A cozy inn.",);
  });

  test("resolves world from the generating chat when no explicit world", async () => {
    await insertChats(db, "World chat", userId, { id: "chat-1", world_id: "chat-world", } as never,);
    const result = await locationCreationTool.handler(
      { name: "Harbor", },
      { db, actorId, chatId: "chat-1", },
    );
    expect(JSON.parse(result.content,),).toMatchObject({ ok: true, worldId: "chat-world", },);
  });

  test("falls back to default world when chat has none", async () => {
    const result = await locationCreationTool.handler(
      { name: "Harbor", },
      { db, actorId, chatId: "chat-1", },
    );
    expect(JSON.parse(result.content,),).toMatchObject({ ok: true, worldId: "default", },);
  });

  test("rejects missing name", async () => {
    const result = await locationCreationTool.handler(
      { description: "no name", },
      { db, actorId, chatId: "chat-1", },
    );
    expect(result.isError,).toBe(true,);
    expect(await db.selectFrom("locations",).select("id",).execute(),).toHaveLength(0,);
  });

  test("fails without execution context", async () => {
    const result = await locationCreationTool.handler({ name: "Harbor", }, undefined,);
    expect(result.isError,).toBe(true,);
  });

  test("creates a bound chat from the world template", async () => {
    await insertChatSetupTemplates(db, "template-world", "World template", {
      id: "template-world",
      mode: "story",
      turn_strategy: "round_robin",
      visibility: "private",
    },);
    const result = await locationCreationTool.handler(
      { name: "The Gilded Tavern", },
      { db, actorId, chatId: "chat-1", },
    );
    expect(result.isError,).not.toBe(true,);
    const parsed = JSON.parse(result.content,);

    const chat = await db
      .selectFrom("chats",)
      .selectAll()
      .where("current_location_id", "=", parsed.id,)
      .executeTakeFirstOrThrow();
    expect(chat.created_by,).toBe(userId,);
    expect(chat.world_id,).toBe("default",);
    expect(chat.type,).toBe("group",);
    expect(chat.mode,).toBe("story",);
    expect(chat.turn_strategy,).toBe("round_robin",);
    expect(chat.template_id,).toBe("template-world",);
    expect(chat.visibility,).toBe("private",);

    // No description param → null on the location row.
    const row = await db
      .selectFrom("locations",)
      .selectAll()
      .where("id", "=", parsed.id,)
      .executeTakeFirstOrThrow();
    expect(row.description,).toBeNull();
  }, 10000,);

  test("bound chat inherits visual_novel rendering from the template gm_config", async () => {
    await insertChatSetupTemplates(db, "template-world", "World template", {
      id: "template-world",
      gm_config: JSON.stringify({ renderingOverride: "visual_novel", },),
    },);
    const result = await locationCreationTool.handler(
      { name: "VN Room", },
      { db, actorId, chatId: "chat-1", },
    );
    const parsed = JSON.parse(result.content,);
    const chat = await db
      .selectFrom("chats",)
      .selectAll()
      .where("current_location_id", "=", parsed.id,)
      .executeTakeFirstOrThrow();
    expect(chat.gm_config,).toContain("visual_novel",);
  }, 10000,);

  test("bound chat falls back to null gm_config when the template gm_config is invalid JSON", async () => {
    await insertChatSetupTemplates(db, "template-world", "World template", {
      id: "template-world",
      gm_config: "{{{not-json",
    },);
    const result = await locationCreationTool.handler(
      { name: "Broken", },
      { db, actorId, chatId: "chat-1", },
    );
    const parsed = JSON.parse(result.content,);
    const chat = await db
      .selectFrom("chats",)
      .selectAll()
      .where("current_location_id", "=", parsed.id,)
      .executeTakeFirstOrThrow();
    // Invalid template gm_config never leaks into the chat row; createChat
    // normalizes to valid JSON with a null renderingOverride.
    expect(chat.gm_config,).not.toContain("{{{not-json",);
    expect(() => JSON.parse(chat.gm_config!,),).not.toThrow();
  }, 10000,);

  test("creates no bound chat when the world template is missing", async () => {
    const result = await locationCreationTool.handler(
      { name: "Nowhere", },
      { db, actorId, chatId: "chat-1", },
    );
    const parsed = JSON.parse(result.content,);
    const chats = await db
      .selectFrom("chats",)
      .select("id",)
      .where("current_location_id", "=", parsed.id,)
      .execute();
    expect(chats,).toHaveLength(0,);
  }, 10000,);

  test("creates no bound chat when the generating actor has no owning user", async () => {
    const orphanId = crypto.randomUUID();
    await insertActors(db, "Orphan", { id: orphanId, user_id: null, owner_id: null, } as never,);
    await insertChatSetupTemplates(db, "template-world", "World template", { id: "template-world", },);
    const result = await locationCreationTool.handler(
      { name: "Orphan's Loc", },
      { db, actorId: orphanId, chatId: "chat-1", },
    );
    const parsed = JSON.parse(result.content,);
    const chats = await db
      .selectFrom("chats",)
      .select("id",)
      .where("current_location_id", "=", parsed.id,)
      .execute();
    expect(chats,).toHaveLength(0,);
    // The location itself is still created.
    const row = await db
      .selectFrom("locations",)
      .select("id",)
      .where("id", "=", parsed.id,)
      .executeTakeFirstOrThrow();
    expect(row.id,).toBe(parsed.id,);
  }, 10000,);

  test("rejects a whitespace-only name", async () => {
    const result = await locationCreationTool.handler(
      { name: "   ", },
      { db, actorId, chatId: "chat-1", },
    );
    expect(result.isError,).toBe(true,);
  });

  test("rejects a non-string name", async () => {
    const result = await locationCreationTool.handler(
      { name: 42, },
      { db, actorId, chatId: "chat-1", },
    );
    expect(result.isError,).toBe(true,);
  });

  test("trims an explicit worldId param", async () => {
    const result = await locationCreationTool.handler(
      { name: "Trimmed", worldId: "  world-a  ", },
      { db, actorId, chatId: "chat-1", },
    );
    expect(JSON.parse(result.content,),).toMatchObject({ ok: true, worldId: "world-a", },);
  });
});
