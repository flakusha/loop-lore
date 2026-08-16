// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * create_world tool — handler tests.
 *
 * Verifies the builtin world-creation wizard: inserts a worlds row owned by
 * the generating actor with default difficulty; rejects missing/empty name
 * and missing execution context.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../test-utils/insert-helpers";
import { worldCreationTool, } from "./create-world";

describe("create_world tool", () => {
  let db: Kysely<DB>;
  const userId = crypto.randomUUID();
  const actorId = crypto.randomUUID();

  beforeEach(async () => {
    const fresh = await createTestDb();
    db = fresh.db;
    await insertUsers(db, `owner-${userId}`, "Owner", { id: userId, } as never,);
    await insertActors(db, "Generator", { id: actorId, user_id: userId, owner_id: userId, } as never,);
  },);

  afterEach(async () => {
    await db?.destroy();
  },);

  test("creates a world owned by the generating actor", async () => {
    const result = await worldCreationTool.handler(
      { name: "Aetheria", description: "A floating continent.", lore: "Lost sky islands.", },
      { db, actorId, chatId: "chat-1", },
    );
    expect(result.isError,).not.toBe(true,);
    expect(JSON.parse(result.content,),).toMatchObject({ ok: true, name: "Aetheria", },);

    const row = await db
      .selectFrom("worlds",)
      .selectAll()
      .where("name", "=", "Aetheria",)
      .executeTakeFirstOrThrow();
    expect(row.owner_id,).toBe(userId,);
    expect(row.description,).toBe("A floating continent.",);
    expect(row.lore,).toBe("Lost sky islands.",);
    expect(row.difficulty_modifier,).toBe(1,);
  });

  test("rejects missing name", async () => {
    const result = await worldCreationTool.handler(
      { description: "no name", },
      { db, actorId, chatId: "chat-1", },
    );
    expect(result.isError,).toBe(true,);
    expect(await db.selectFrom("worlds",).select("id",).execute(),).toHaveLength(0,);
  });

  test("rejects empty/whitespace name", async () => {
    const result = await worldCreationTool.handler(
      { name: "\t ", },
      { db, actorId, chatId: "chat-1", },
    );
    expect(result.isError,).toBe(true,);
  });

  test("fails without execution context", async () => {
    const result = await worldCreationTool.handler({ name: "Aetheria", }, undefined,);
    expect(result.isError,).toBe(true,);
  });
});
