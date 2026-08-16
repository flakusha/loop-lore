// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * create_character tool — handler tests.
 *
 * Verifies the builtin character-creation wizard: inserts an actors row with
 * `actor_type=character`, `agent_type=ai`, `import_spec="assistant-wizard"`,
 * ownership bound to the generating actor; rejects missing/empty name and
 * missing execution context.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../test-utils/insert-helpers";
import { characterCreationTool, } from "./create-character";

describe("create_character tool", () => {
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

  test("creates a character owned by the generating actor", async () => {
    const result = await characterCreationTool.handler(
      { name: "Lyra", description: "A wandering bard.", personality: "Witty", scenario: "Arrives at the inn.", },
      { db, actorId, chatId: "chat-1", },
    );
    expect(result.isError,).not.toBe(true,);
    expect(JSON.parse(result.content,),).toMatchObject({ ok: true, name: "Lyra", },);

    const row = await db
      .selectFrom("actors",)
      .selectAll()
      .where("display_name", "=", "Lyra",)
      .executeTakeFirstOrThrow();
    expect(row.actor_type,).toBe("character",);
    expect(row.agent_type,).toBe("ai",);
    expect(row.owner_id,).toBe(userId,);
    expect(row.user_id,).toBe(userId,);
    expect(row.import_spec,).toBe("assistant-wizard",);
    expect(row.personality,).toBe("Witty",);
    expect(row.scenario,).toBe("Arrives at the inn.",);
  });

  test("rejects missing name", async () => {
    const result = await characterCreationTool.handler(
      { description: "no name", },
      { db, actorId, chatId: "chat-1", },
    );
    expect(result.isError,).toBe(true,);
    const created = await db
      .selectFrom("actors",)
      .select("id",)
      .where("import_spec", "=", "assistant-wizard",)
      .execute();
    expect(created,).toHaveLength(0,);
  });

  test("rejects empty/whitespace name", async () => {
    const result = await characterCreationTool.handler(
      { name: " ".repeat(3,), },
      { db, actorId, chatId: "chat-1", },
    );
    expect(result.isError,).toBe(true,);
  });

  test("fails without execution context", async () => {
    const result = await characterCreationTool.handler({ name: "Lyra", }, undefined,);
    expect(result.isError,).toBe(true,);
  });
});
