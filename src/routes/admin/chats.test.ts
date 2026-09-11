// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for admin chats routes (list/get/update/delete).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { ChatType, } from "../../db/enums";
import { insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { chatsRoutes, } from "./chats";

/**
 * @param db
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userRole: string | null,) {
  const app = new Elysia({ name: "test-chats", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? `test-user-${userRole}` : null,
    userRole,
  }));
  return app.use(chatsRoutes({ database: db, config: {} as Config, }, "/api",),);
}

let db: Kysely<DB>;
let sqlite: TestDb["sqlite"];

const TEST_USER = "00000000-0000-0000-0000-000000000001";
const TEST_CHAT = "00000000-0000-0000-0000-000000000010";

beforeAll(async () => {
  const tdb = await createTestDb();
  db = tdb.db;
  sqlite = tdb.sqlite;
  await insertUsers(db, "alice", "Alice", { id: TEST_USER, },);
  await insertChats(db, "Test Chat", TEST_USER, { id: TEST_CHAT, type: ChatType.Direct, },);

},);
afterAll(() => {
  sqlite.close();
},);

describe("admin chats routes", () => {
  test("GET /api/admin/chats returns 401 for anonymous", async () => {
    const app = makeApp(db, null,);
    const res = await app.handle(new Request("http://localhost/api/admin/chats",),);
    expect(res.status,).toBe(401,);
  });

  test("GET /api/admin/chats returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(new Request("http://localhost/api/admin/chats",),);
    expect(res.status,).toBe(403,);
  });

  test("GET /api/admin/chats returns 200 for admin", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/chats",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: unknown[]; total: number; page: number; pageSize: number };
    expect(Array.isArray(body.data,),).toBe(true,);
    expect(body.page,).toBe(1,);
  });

  test("GET /api/admin/chats?q=test applies search filter", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/chats?q=Test",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: { name: string }[] };
    expect(body.data.length,).toBeGreaterThanOrEqual(1,);
  });

  test("GET /api/admin/chats?type=1on1 applies type filter", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/chats?type=1on1",),);
    expect(res.status,).toBe(200,);
  });

  test("GET /api/admin/chats/:id returns 200 for admin (existing chat)", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request(`http://localhost/api/admin/chats/${TEST_CHAT}`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { id: string; messageCount: number; participants: unknown[] };
    expect(body.id,).toBe(TEST_CHAT,);
    expect(body.messageCount,).toBe(0,);
  });

  test("GET /api/admin/chats/:id returns 404 for bogus id", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/chats/00000000-0000-0000-0000-000000000999",),
    );
    expect(res.status,).toBe(404,);
  });

  test("GET /api/admin/chats/:id returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/admin/chats/${TEST_CHAT}`,),
    );
    expect(res.status,).toBe(403,);
  });

  test("PATCH /api/admin/chats/:id returns 200 for valid update", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request(`http://localhost/api/admin/chats/${TEST_CHAT}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ is_pinned: "true", },),
      },),
    );
    expect(res.status,).toBe(200,);
  });

  test("PATCH /api/admin/chats/:id returns 400 for empty body", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request(`http://localhost/api/admin/chats/${TEST_CHAT}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ not_a_field: "ignored", },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("DELETE /api/admin/chats/:id returns 204 for admin", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request(`http://localhost/api/admin/chats/${TEST_CHAT}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(204,);
  });

  test("DELETE /api/admin/chats/:id returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/admin/chats/${TEST_CHAT}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(403,);
  });
},);
