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
import { insertActors, insertChats, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
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
});
