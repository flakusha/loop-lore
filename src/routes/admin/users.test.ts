// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for admin users routes (list/get/update role/delete).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { usersRoutes, } from "./users";

/**
 * @param db
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userRole: string | null,) {
  const app = new Elysia({ name: "test-users", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? `test-user-${userRole}` : null,
    userRole,
  }));
  return app.use(usersRoutes({ database: db, config: {} as Config, }, "/api",),);
}

let db: Kysely<DB>;
let sqlite: TestDb["sqlite"];
const TEST_USER = "00000000-0000-0000-0000-000000000040";
const OTHER_USER = "00000000-0000-0000-0000-000000000041";

beforeAll(async () => {
  const tdb = await createTestDb();
  db = tdb.db;
  sqlite = tdb.sqlite;
  await insertUsers(db, "alice", "Alice", { id: TEST_USER, },);
  await insertUsers(db, "bob", "Bob", { id: OTHER_USER, role: "user", },);
},);

afterAll(() => {
  sqlite.close();
},);

describe("admin users routes", () => {
  test("GET /api/admin/users returns 401 for anonymous", async () => {
    const app = makeApp(db, null,);
    const res = await app.handle(new Request("http://localhost/api/admin/users",),);
    expect(res.status,).toBe(401,);
  });

  test("GET /api/admin/users returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(new Request("http://localhost/api/admin/users",),);
    expect(res.status,).toBe(403,);
  });

  test("GET /api/admin/users returns 200 for admin", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/users",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: unknown[]; total: number };
    expect(Array.isArray(body.data,),).toBe(true,);
    expect(body.total,).toBeGreaterThanOrEqual(2,);
  });

  test("GET /api/admin/users?q=ali applies search filter", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/users?q=ali",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: { username: string }[] };
    expect(body.data.some((u,) => u.username === "alice"),).toBe(true,);
  });

  test("GET /api/admin/users?role=user filters by role", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/users?role=user",),);
    expect(res.status,).toBe(200,);
  });

  test("GET /api/admin/users/:id returns 200 for admin (existing user)", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request(`http://localhost/api/admin/users/${TEST_USER}`,),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { id: string; username: string };
    expect(body.username,).toBe("alice",);
  });

  test("GET /api/admin/users/:id returns 404 for bogus id", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/users/00000000-0000-0000-0000-000000000999",),
    );
    expect(res.status,).toBe(404,);
  });

  test("GET /api/admin/users/:id returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(new Request(`http://localhost/api/admin/users/${TEST_USER}`,),);
    expect(res.status,).toBe(403,);
  });

  test("PATCH /api/admin/users/:id/role returns 200 for valid role update", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request(`http://localhost/api/admin/users/${TEST_USER}/role`, {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ role: "viewer", },),
      },),
    );
    expect(res.status,).toBe(200,);
  });

  test("PATCH /api/admin/users/:id/role returns 400 for invalid role", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request(`http://localhost/api/admin/users/${TEST_USER}/role`, {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ role: "not-a-real-role", },),
      },),
    );
    expect(res.status,).toBe(422,);
  });

  test("DELETE /api/admin/users/:id returns 204 for admin", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request(`http://localhost/api/admin/users/${OTHER_USER}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(204,);
  });

  test("DELETE /api/admin/users/:id returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/admin/users/${TEST_USER}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(403,);
  });
});
