// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for message read routes (list / get / variants / select).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertMessages, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { readRoutes, } from "./read";

const testConfig = {} as unknown as Config;

/**
 * @param db
 * @param userId
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-read-coverage", },)
    .derive({ as: "scoped", }, () => ({ userId, userRole, }),)
    .use(readRoutes({ database: db, config: testConfig, },),) as unknown as Elysia;
}

/**
 * @param db
 * @param id
 * @param name
 */
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
      format_version: 0,
      visibility: "private",
      import_spec: "{}",
    },)
    .execute();
}

describe("readRoutes coverage", () => {
  let db: Kysely<DB>;
  const owner = uid();
  const stranger = uid();
  let chatId: string;
  let firstMessageId: string;
  let parentId: string;
  let swipeA: string;
  let swipeB: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await seedUser(db, owner, "Owner",);
    await seedUser(db, stranger, "Stranger",);
    chatId = uid();
    await insertChats(db, "Read Chat", owner, { id: chatId, } as never,);
    firstMessageId = uid();
    await insertMessages(db, chatId, owner, MessageRole.User, "hello", {
      id: firstMessageId,
    } as never,);
    parentId = uid();
    await insertMessages(db, chatId, owner, MessageRole.User, "parent", {
      id: parentId,
      swipe_index: 0,
    } as never,);
    swipeA = uid();
    swipeB = uid();
    await insertMessages(db, chatId, owner, MessageRole.Assistant, "swipe one", {
      id: swipeA,
      parent_id: parentId,
      swipe_index: 1,
    } as never,);
    await insertMessages(db, chatId, owner, MessageRole.Assistant, "swipe two", {
      id: swipeB,
      parent_id: parentId,
      swipe_index: 2,
    } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("401 across all read endpoints without userId", async () => {
    const app = makeApp(db, null, null,);
    const list = await app.handle(new Request(`http://localhost/api/chats/${chatId}/messages`,),);
    expect(list.status,).toBe(401,);
    const get = await app.handle(new Request(`http://localhost/api/messages/${firstMessageId}`,),);
    expect(get.status,).toBe(401,);
    const variants = await app.handle(
      new Request(`http://localhost/api/messages/${swipeA}/variants`,),
    );
    expect(variants.status,).toBe(401,);
    const select = await app.handle(
      new Request(`http://localhost/api/messages/${swipeA}/variant`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ variantIndex: 0, },),
      },),
    );
    expect(select.status,).toBe(401,);
  },);

  test("list returns paginated messages with content", async () => {
    const app = makeApp(db, owner, "user",);
    const res = await app.handle(new Request(`http://localhost/api/chats/${chatId}/messages`,),);
    expect(res.status,).toBe(200,);
    const parsed = (await res.json()) as {
      data: { id: string; content: string }[];
      pagination: { total: number; page: number; pageSize: number };
    };
    expect(parsed.pagination.total,).toBeGreaterThanOrEqual(4,);
    expect(parsed.data.length,).toBeGreaterThan(0,);
    const first = parsed.data.find((m,) => m.id === firstMessageId,);
    expect(first?.content,).toBe("hello",);
  },);

  test("list honors pageSize and parentId filter", async () => {
    const app = makeApp(db, owner, "user",);
    const page = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/messages?page=1&pageSize=1`,),
    );
    expect(page.status,).toBe(200,);
    const pageBody = (await page.json()) as { data: unknown[]; pageSize: number };
    expect(pageBody.data,).toHaveLength(1,);
    const filtered = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/messages?parentId=${parentId}`,),
    );
    expect(filtered.status,).toBe(200,);
    const filteredBody = (await filtered.json()) as { data: { id: string }[] };
    const ids = filteredBody.data.map((m,) => m.id,);
    expect(ids,).toContain(swipeA,);
    expect(ids,).toContain(swipeB,);
    expect(ids,).not.toContain(firstMessageId,);
  },);

  test("list 404 for missing chat and stranger", async () => {
    const app = makeApp(db, owner, "user",);
    const missing = await app.handle(
      new Request(`http://localhost/api/chats/${uid()}/messages`,),
    );
    expect(missing.status,).toBe(404,);
    const other = makeApp(db, stranger, "user",);
    const denied = await other.handle(
      new Request(`http://localhost/api/chats/${chatId}/messages`,),
    );
    expect(denied.status,).toBe(404,);
  },);

  test("get single message by id", async () => {
    const app = makeApp(db, owner, "user",);
    const res = await app.handle(new Request(`http://localhost/api/messages/${firstMessageId}`,),);
    expect(res.status,).toBe(200,);
    const parsed = (await res.json()) as { id: string; content: string };
    expect(parsed.id,).toBe(firstMessageId,);
    expect(parsed.content,).toBe("hello",);
  },);

  test("get 404 for missing id and stranger", async () => {
    const app = makeApp(db, owner, "user",);
    const missing = await app.handle(new Request(`http://localhost/api/messages/${uid()}`,),);
    expect(missing.status,).toBe(404,);
    const other = makeApp(db, stranger, "user",);
    const denied = await other.handle(
      new Request(`http://localhost/api/messages/${firstMessageId}`,),
    );
    expect(denied.status,).toBe(404,);
  },);

  test("variants lists sibling swipes", async () => {
    const app = makeApp(db, owner, "user",);
    const res = await app.handle(new Request(`http://localhost/api/messages/${swipeA}/variants`,),);
    expect(res.status,).toBe(200,);
    const parsed = (await res.json()) as { id: string; content: string }[];
    const ids = parsed.map((m,) => m.id,);
    expect(ids,).toContain(swipeA,);
    expect(ids,).toContain(swipeB,);
    expect(parsed.find((m,) => m.id === swipeB,)?.content,).toBe("swipe two",);
  },);

  test("variants 404 for missing id", async () => {
    const app = makeApp(db, owner, "user",);
    const res = await app.handle(new Request(`http://localhost/api/messages/${uid()}/variants`,),);
    expect(res.status,).toBe(404,);
  },);

  test("select variant returns the indexed sibling", async () => {
    const app = makeApp(db, owner, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/messages/${swipeA}/variant`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ variantIndex: 1, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const parsed = (await res.json()) as { id: string };
    expect(parsed.id,).toBe(swipeB,);
  },);

  test("select variant 400 for out-of-range index", async () => {
    const app = makeApp(db, owner, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/messages/${swipeA}/variant`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ variantIndex: 99, },),
      },),
    );
    expect(res.status,).toBe(400,);
  },);

  test("select variant 404 for missing id", async () => {
    const app = makeApp(db, owner, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/messages/${uid()}/variant`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ variantIndex: 0, },),
      },),
    );
    expect(res.status,).toBe(404,);
  },);
});
