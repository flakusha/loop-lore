// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for admin worlds routes (list/get/delete).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { worldsRoutes, } from "./worlds";

/**
 * @param db
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userRole: string | null,) {
  const app = new Elysia({ name: "test-worlds", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? `test-user-${userRole}` : null,
    userRole,
  }));
  return app.use(worldsRoutes({ database: db, config: {} as Config, }, "/api",),);
}

let db: Kysely<DB>;
let sqlite: TestDb["sqlite"];
const TEST_USER = "00000000-0000-0000-0000-000000000050";
const TEST_WORLD = "00000000-0000-0000-0000-000000000051";
const OTHER_WORLD = "00000000-0000-0000-0000-000000000052";

beforeAll(async () => {
  const tdb = await createTestDb();
  db = tdb.db;
  sqlite = tdb.sqlite;
  await insertUsers(db, "wren", "Wren", { id: TEST_USER, },);
  await insertWorlds(db, TEST_USER, "Eldoria", { id: TEST_WORLD, },);
  await insertWorlds(db, TEST_USER, "Other Realm", { id: OTHER_WORLD, },);
},);

afterAll(() => {
  sqlite.close();
},);

describe("admin worlds routes", () => {
  test("GET /api/admin/worlds returns 401 for anonymous", async () => {
    const app = makeApp(db, null,);
    const res = await app.handle(new Request("http://localhost/api/admin/worlds",),);
    expect(res.status,).toBe(401,);
  });

  test("GET /api/admin/worlds returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(new Request("http://localhost/api/admin/worlds",),);
    expect(res.status,).toBe(403,);
  });

  test("GET /api/admin/worlds returns 200 for admin", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/worlds",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: unknown[]; total: number };
    expect(Array.isArray(body.data,),).toBe(true,);
    expect(body.total,).toBeGreaterThanOrEqual(2,);
  });

  test("GET /api/admin/worlds?q=Eldoria applies search filter", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/worlds?q=Eldoria",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: { name: string }[] };
    expect(body.data.some((w,) => w.name === "Eldoria",),).toBe(true,);
  });

  test("GET /api/admin/worlds/:id returns 200 for admin (existing world)", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request(`http://localhost/api/admin/worlds/${TEST_WORLD}`,),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { id: string; name: string; locationCount: number };
    expect(body.name,).toBe("Eldoria",);
    expect(body.locationCount,).toBe(0,);
  });

  test("GET /api/admin/worlds/:id returns 404 for bogus id", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/worlds/00000000-0000-0000-0000-000000000999",),
    );
    expect(res.status,).toBe(404,);
  });

  test("GET /api/admin/worlds/:id returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(new Request(`http://localhost/api/admin/worlds/${TEST_WORLD}`,),);
    expect(res.status,).toBe(403,);
  });

  test("DELETE /api/admin/worlds/:id returns 204 for admin", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request(`http://localhost/api/admin/worlds/${OTHER_WORLD}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(204,);
  });

  test("DELETE /api/admin/worlds/:id returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/admin/worlds/${TEST_WORLD}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(403,);
  });
},);
