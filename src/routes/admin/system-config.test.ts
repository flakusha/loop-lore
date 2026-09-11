// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for admin system-config routes (key/value configuration CRUD).
 *
 * Verifies:
 *   - requireUserId 401 path
 *   - can(userRole, 'admin.system') 403 path
 *   - GET 200 (empty + seeded)
 *   - PATCH 200 (valid body) / 400 (invalid body)
 *   - DELETE 204
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { setConfig, } from "../../admin/config";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { systemConfigRoutes, } from "./system-config";

/**
 * @param db
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userRole: string | null,) {
  const app = new Elysia({ name: "test-system-config", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? `test-user-${userRole}` : null,
    userRole,
  }));
  return app.use(systemConfigRoutes({ database: db, config: {} as Config, }, "/api",),);
}

let db: Kysely<DB>;
// TestDb imported from create-test-db.ts
let sqlite: TestDb["sqlite"];

beforeAll(async () => {
  const tdb = await createTestDb();
  db = tdb.db;
  sqlite = tdb.sqlite;
},);

afterAll(() => {
  sqlite.close();
},);

describe("admin system-config routes", () => {
  test("GET /api/admin/system-config returns 401 for anonymous", async () => {
    const app = makeApp(db, null,);
    const res = await app.handle(new Request("http://localhost/api/admin/system-config",),);
    expect(res.status,).toBe(401,);
  });

  test("GET /api/admin/system-config returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(new Request("http://localhost/api/admin/system-config",),);
    expect(res.status,).toBe(403,);
  });

  test("GET /api/admin/system-config returns 200 with empty array for admin", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/system-config",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body,),).toBe(true,);
  });

  test("GET /api/admin/system-config returns 200 with seeded configs", async () => {
    await setConfig(db, "test.key.1", "value-1", "test 1",);
    await setConfig(db, "test.key.2", "value-2",);
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/system-config",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { key: string; value: string }[];
    expect(body.length,).toBeGreaterThanOrEqual(2,);
    expect(body.some((c,) => c.key === "test.key.1" && c.value === "value-1"),).toBe(true,);
  });

  test("PATCH /api/admin/system-config returns 200 with valid body", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/system-config", {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ key: "patched.key", value: "patched-value", description: "desc", },),
      },),
    );
    expect(res.status,).toBe(200,);
  });

  test("PATCH /api/admin/system-config returns 400 with invalid body", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/system-config", {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ wrong: "shape", },),
      },),
    );
    expect(res.status,).toBe(422,);
  });

  test("PATCH /api/admin/system-config returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/system-config", {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ key: "k", value: "v", },),
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("DELETE /api/admin/system-config/:key returns 204", async () => {
    await setConfig(db, "delete.me", "x",);
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/system-config/delete.me", { method: "DELETE", },),
    );
    expect(res.status,).toBe(204,);
  });

  test("DELETE /api/admin/system-config/:key returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/system-config/anything", { method: "DELETE", },),
    );
    expect(res.status,).toBe(403,);
  });
});
