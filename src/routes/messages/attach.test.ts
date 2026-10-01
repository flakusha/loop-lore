// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for `POST /messages/:id/attachments`
 * (TASK-chat-feature-component-buttons AC1/AC3/AC4): auth, existence,
 * outsider access, asset ownership, merge/idempotency, link-row writes.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import {
  insertAssets,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { attachRoutes, } from "./attach";

/**
 * Mount the attach plugin with a derived auth context.
 * @param db
 * @param userId
 * @param userRole
 * @returns Elysia test app
 */
function makeApp(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-attach", },)
    .derive({ as: "scoped", }, () => ({ userId, userRole, }),)
    .use(attachRoutes({ database: db, config: {} as Config, },),) as unknown as Elysia;
}

/**
 * POST an attach request against the test app.
 * @param app
 * @param messageId
 * @param body
 * @returns {Promise<Response>}
 */
function postAttach(app: Elysia, messageId: string, body: Record<string, unknown>,): Promise<Response> {
  return app.handle(
    new Request(`http://localhost/api/messages/${messageId}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

/**
 * Read back the raw `messages.attachments` column.
 * @param db
 * @param messageId
 * @returns Parsed rows (empty list when null)
 */
async function readAttachments(db: Kysely<DB>, messageId: string,): Promise<{ assetId?: string; order?: number; label?: string }[]> {
  const row = await db
    .selectFrom("messages",)
    .select("attachments",)
    .where("id", "=", messageId,)
    .executeTakeFirst();
  if (!row?.attachments) { return []; }
  return JSON.parse(row.attachments,) as { assetId?: string; order?: number; label?: string }[];
}

/**
 * Count asset_links rows for one asset.
 * @param db
 * @param assetId
 * @returns Row count
 */
async function countLinks(db: Kysely<DB>, assetId: string,): Promise<number> {
  const rows = await db
    .selectFrom("asset_links",)
    .select("asset_id",)
    .where("asset_id", "=", assetId,)
    .execute();
  return rows.length;
}

/**
 * Seed a user plus its actor row (messages/chat participants FK to actors).
 * @param db
 * @param id
 * @param name
 */
async function seedUser(db: Kysely<DB>, id: string, name: string,): Promise<void> {
  await insertUsers(db, id, name, { id, } as never,);
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
      format_version: 0,
      visibility: "private",
      import_spec: "{}",
    },)
    .execute();
}

describe("POST /messages/:id/attachments", () => {
  let db: Kysely<DB>;
  let sqlite: Parameters<typeof resetTestDb>[0];
  const owner = "user-owner";
  const stranger = "user-stranger";
  const assetOwned = "asset-owned";
  const assetOther = "asset-other";
  const assetExisting = "asset-existing";
  let chatId: string;
  let messageId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb(),);
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    resetTestDb(sqlite,);
    await seedUser(db, owner, "Owner",);
    await seedUser(db, stranger, "Stranger",);
    await insertAssets(db, owner, "a.png", "image/png", "image", 10, "/a.png", { id: assetOwned, },);
    await insertAssets(db, stranger, "b.png", "image/png", "image", 10, "/b.png", { id: assetOther, },);
    await insertAssets(db, owner, "c.png", "image/png", "image", 10, "/c.png", { id: assetExisting, },);
    chatId = uid();
    messageId = uid();
    await insertChats(db, "Attach chat", owner, { id: chatId, } as never,);
    await insertMessages(db, chatId, owner, MessageRole.User, "hello", {
      id: messageId,
      swipe_index: 0,
    } as never,);
  });

  test("401 without a user id", async () => {
    const app = makeApp(db, null, null,);
    const res = await postAttach(app, messageId, { assetId: assetOwned, },);
    expect(res.status,).toBe(401,);
  });

  test("404 for an unknown message id", async () => {
    const app = makeApp(db, owner, "user",);
    const res = await postAttach(app, uid(), { assetId: assetOwned, },);
    expect(res.status,).toBe(404,);
  });

  test("404 for a chat outsider (message existence not leaked)", async () => {
    const app = makeApp(db, stranger, "user",);
    const res = await postAttach(app, messageId, { assetId: assetOther, },);
    expect(res.status,).toBe(404,);
    expect(await readAttachments(db, messageId,),).toHaveLength(0,);
  });

  test("400 for an asset the caller does not own, writing nothing", async () => {
    const app = makeApp(db, owner, "user",);
    const res = await postAttach(app, messageId, { assetId: assetOther, },);
    expect(res.status,).toBe(400,);
    expect(await readAttachments(db, messageId,),).toHaveLength(0,);
    expect(await countLinks(db, assetOther,),).toBe(0,);
  });

  test("attaches an owned asset: response row, JSON column, link row", async () => {
    const app = makeApp(db, owner, "user",);
    const res = await postAttach(app, messageId, { assetId: assetOwned, },);
    expect(res.status,).toBe(201,);
    const body: { data: { assetId: string; order: number; label: string }[]; } = await res.json();
    expect(body.data,).toHaveLength(1,);
    expect(body.data[0]?.assetId,).toBe(assetOwned,);
    expect(body.data[0]?.order,).toBe(0,);
    expect(body.data[0]?.label,).toBe("message-attachment",);

    const stored = await readAttachments(db, messageId,);
    expect(stored,).toHaveLength(1,);
    expect(stored[0]?.assetId,).toBe(assetOwned,);
    expect(await countLinks(db, assetOwned,),).toBe(1,);
  });

  test("repeat attach is idempotent: 200, one row, one link", async () => {
    const app = makeApp(db, owner, "user",);
    await postAttach(app, messageId, { assetId: assetOwned, },);
    const res = await postAttach(app, messageId, { assetId: assetOwned, },);
    expect(res.status,).toBe(200,);
    const body: { data: { assetId: string }[]; } = await res.json();
    expect(body.data,).toHaveLength(1,);
    expect(await readAttachments(db, messageId,),).toHaveLength(1,);
    expect(await countLinks(db, assetOwned,),).toBe(1,);
  });

  test("appends to existing attachments and preserves their order", async () => {
    await db
      .updateTable("messages",)
      .set({
        attachments: JSON.stringify([
          { assetId: assetExisting, order: 0, caption: "", label: "message-attachment", },
        ],),
      },)
      .where("id", "=", messageId,)
      .execute();

    const app = makeApp(db, owner, "user",);
    const res = await postAttach(app, messageId, { assetId: assetOwned, },);
    expect(res.status,).toBe(201,);
    const stored = await readAttachments(db, messageId,);
    expect(stored,).toHaveLength(2,);
    expect(stored[0]?.assetId,).toBe(assetExisting,);
    expect(stored[0]?.order,).toBe(0,);
    expect(stored[1]?.assetId,).toBe(assetOwned,);
    expect(stored[1]?.order,).toBe(1,);
  });

  test("422 when assetId fails body validation", async () => {
    const app = makeApp(db, owner, "user",);
    const res = await postAttach(app, messageId, { assetId: "", },);
    expect(res.status,).toBe(422,);
  });
});
