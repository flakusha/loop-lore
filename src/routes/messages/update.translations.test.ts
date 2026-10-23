// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Stale-translation invalidation on the message edit path: editing a
 * message's content hard-deletes its `message_translations` rows (additive
 * caches, retranslation is lazy) in the SAME transaction as the content
 * update — a failed edit leaves rows untouched, a succeeded edit never
 * leaves stale rows behind. Unrelated messages keep their rows.
 *
 * Resource contract: one fresh in-memory DB per test (createTestDb in
 * beforeEach), destroyed in afterEach; no provider-registry entries, no
 * files, no ports.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertChats,
  insertMessages,
  insertMessageTranslations,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { updateRoutes, } from "./update";

const testConfig = {
  encryption: { compressThreshold: 1024, compressAlgorithm: "gzip", },
} as unknown as Config;

/**
 * @param db
 * @param userId
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: `test-update-translations-${uid()}`, },)
    .derive({ as: "scoped", }, () => ({ userId, userRole, }),)
    .use(updateRoutes({ database: db, config: testConfig, },),) as unknown as Elysia;
}

/** */
async function seedUser(db: Kysely<DB>, id: string, name: string,): Promise<void> {
  await insertUsers(db, `user-${id}`, name, { id, } as never,);
  await db
    .insertInto("actors",)
    .values({
      id,
      actor_type: "user",
      display_name: name,
      user_id: id,
      owner_id: id,
      agent_type: "none",
      settings: "{}",
      row_version: 0,
      visibility: "private",
      import_spec: "{}",
    },)
    .execute();
}

describe("message edit clears stale translations", () => {
  let fixture: TestDb;
  let db: Kysely<DB>;
  const owner = uid();
  let chatId: string;

  beforeEach(async () => {
    createLogger({ level: "error", },);
    fixture = await createTestDb();
    db = fixture.db;
    await seedUser(db, owner, "Owner",);
    chatId = uid();
    await insertChats(db, "Edit Chat", owner, { id: chatId, } as never,);
  },);

  afterEach(async () => {
    await destroyTestDb(fixture,);
  },);

  /**
   * @param content
   * @param role
   */
  async function seedMessage(content: string, role: MessageRole = MessageRole.User,): Promise<string> {
    const id = uid();
    await insertMessages(db, chatId, owner, role, content, { id, } as never,);
    return id;
  }

  test("editing a message hard-deletes its translation rows and stamps edited_at", async () => {
    const id = await seedMessage("hello",);
    await insertMessageTranslations(db, id, "es", "hola", new Date().toISOString(),);
    await insertMessageTranslations(db, id, "fr", "bonjour", new Date().toISOString(),);

    const app = makeApp(db, owner, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "hello edited", },),
      },),
    );

    expect(res.status,).toBe(200,);

    const rows = await db.selectFrom("message_translations",).selectAll()
      .where("message_id", "=", id,).execute();

    expect(rows,).toEqual([],);

    const msg = await db.selectFrom("messages",).select(["content", "edited_at",],)
      .where("id", "=", id,).executeTakeFirst();

    expect(msg?.content,).toBe("hello edited",);
    expect(msg?.edited_at,).not.toBeNull();
  });

  test("unrelated messages keep their translation rows", async () => {
    const id = await seedMessage("mine",);
    const other = await seedMessage("theirs",);
    await insertMessageTranslations(db, id, "es", "hola", new Date().toISOString(),);
    await insertMessageTranslations(db, other, "es", "hola (otro)", new Date().toISOString(),);

    const app = makeApp(db, owner, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "mine edited", },),
      },),
    );

    expect(res.status,).toBe(200,);

    const otherRows = await db.selectFrom("message_translations",).selectAll()
      .where("message_id", "=", other,).execute();

    expect(otherRows,).toHaveLength(1,);
    expect(otherRows[0]?.content,).toBe("hola (otro)",);
  });

  test("a failed edit leaves translation rows untouched", async () => {
    const id = await seedMessage("safe",);
    await insertMessageTranslations(db, id, "es", "hola", new Date().toISOString(),);

    // Simulate the write failing inside the transaction: the executor never
    // reaches the delete, so the rows must survive alongside the original.
    const originalTransaction = db.transaction.bind(db,);
    (db as unknown as Record<string, unknown>).transaction = () => ({
      execute: async (fn: (trx: Kysely<DB>,) => Promise<void>,) => {
        await fn(Object.create(Object.getPrototypeOf(db,), {
          updateTable: {
            value: () => {
              throw new Error("simulated write failure",);
            },
          },
        },) as Kysely<DB>,);
      },
    });

    try {
      const app = makeApp(db, owner, "user",);
      const res = await app.handle(
        new Request(`http://localhost/api/messages/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ content: "should never persist", },),
        },),
      );

      expect(res.status,).toBe(500,);
    } finally {
      (db as unknown as Record<string, unknown>).transaction = originalTransaction;
    }

    const rows = await db.selectFrom("message_translations",).selectAll()
      .where("message_id", "=", id,).execute();

    expect(rows,).toHaveLength(1,);

    const msg = await db.selectFrom("messages",).select(["content", "edited_at",],)
      .where("id", "=", id,).executeTakeFirst();

    expect(msg?.content,).toBe("safe",);
    expect(msg?.edited_at,).toBeNull();
  });
});
