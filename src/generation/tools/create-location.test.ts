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
import {
  insertActors,
  insertChats,
  insertChatSetupTemplates,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
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

  test("creates a location in the chat's world", async () => {
    await insertChats(db, "World chat", userId, { id: "chat-1", world_id: "world-a", } as never,);
    const result = await locationCreationTool.handler(
      { name: "The Gilded Tavern", description: "A cozy inn.", },
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

  test("resolves world from the generating chat", async () => {
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
    expect(() => JSON.parse(chat.gm_config!,)).not.toThrow();
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

  test("refuses an actor with no owning user", async () => {
    const orphanId = crypto.randomUUID();
    await insertActors(db, "Orphan", { id: orphanId, user_id: null, owner_id: null, } as never,);
    await insertChatSetupTemplates(db, "template-world", "World template", { id: "template-world", },);
    const result = await locationCreationTool.handler(
      { name: "Orphan's Loc", },
      { db, actorId: orphanId, chatId: "chat-1", },
    );

    // The world gate resolves the owning user through the generating actor;
    // an actor with none cannot be authorized, so nothing is written.
    expect(result.isError,).toBe(true,);
    expect(await db.selectFrom("locations",).select("id",).execute(),).toHaveLength(0,);
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

  // ── BUG-llm-chosen-worldid-cross-world-write ───────────────
  //
  // The second call site of the defect: a model-authored `worldId` reached an
  // unguarded `locations` insert (and the auto-created bound chat with it). The
  // parameter is gone; the chat's world is the only source, and the world gate
  // still runs against the generating actor.
  test("a model-supplied worldId cannot move the write into another world", async () => {
    await insertUsers(db, `rival-${userId}`, "Rival", { id: "rival-user", } as never,);
    await insertWorlds(db, "rival-user", "rival-world", { id: "rival-world", } as never,);
    await insertChats(db, "World chat", userId, { id: "chat-1", world_id: "world-a", } as never,);

    const result = await locationCreationTool.handler(
      // `additionalProperties: false` is a hint to the model, not a filter.
      { name: "Trojan Tavern", worldId: "rival-world", },
      { db, actorId, chatId: "chat-1", },
    );

    expect(JSON.parse(result.content,),).toMatchObject({ ok: true, worldId: "world-a", },);
    expect(await db.selectFrom("locations",).select("world_id",).execute(),).toEqual([{ world_id: "world-a", },],);
  });

  test("a chat bound to a world the actor cannot access is refused", async () => {
    await insertUsers(db, `rival-${userId}`, "Rival", { id: "rival-user", } as never,);
    await insertWorlds(db, "rival-user", "rival-world", { id: "rival-world", } as never,);
    await insertChats(db, "Rival chat", userId, { id: "chat-1", world_id: "rival-world", } as never,);

    const result = await locationCreationTool.handler(
      { name: "Trojan Tavern", },
      { db, actorId, chatId: "chat-1", },
    );

    expect(result.isError,).toBe(true,);
    expect(await db.selectFrom("locations",).select("id",).execute(),).toHaveLength(0,);
  });
});
