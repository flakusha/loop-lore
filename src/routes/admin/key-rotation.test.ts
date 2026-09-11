// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for admin key-rotation route (POST /api/admin/rotate-expired-keys).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { keyRotationRoutes, } from "./key-rotation";

/**
 * @param db
 * @param userRole
 * @param config
 */
function makeApp(db: Kysely<DB>, userRole: string | null, config?: Config,) {
  const app = new Elysia({ name: "test-key-rotation", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? `test-user-${userRole}` : null,
    userRole,
  }));
  return app.use(keyRotationRoutes({ database: db, config: config ?? {} as Config, }, "/api",),);
}

let db: Kysely<DB>;
let sqlite: TestDb["sqlite"];

beforeAll(async () => {
  const tdb = await createTestDb();
  db = tdb.db;
  sqlite = tdb.sqlite;
},);

afterAll(() => {
  sqlite.close();
},);

describe("admin key-rotation route", () => {
  test("POST /api/admin/rotate-expired-keys returns 401 for anonymous", async () => {
    const app = makeApp(db, null,);
    const res = await app.handle(
      new Request("http://localhost/api/admin/rotate-expired-keys", { method: "POST", },),
    );
    expect(res.status,).toBe(401,);
  });

  test("POST /api/admin/rotate-expired-keys returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/rotate-expired-keys", { method: "POST", },),
    );
    expect(res.status,).toBe(403,);
  });

  test("POST /api/admin/rotate-expired-keys returns 400 when auto-rotation disabled", async () => {
    const config = { encryption: { keyRotationDays: 0, }, } as unknown as Config;
    const app = makeApp(db, "admin", config,);
    const res = await app.handle(
      new Request("http://localhost/api/admin/rotate-expired-keys", { method: "POST", },),
    );
    expect(res.status,).toBe(400,);
  });

  test("POST /api/admin/rotate-expired-keys returns 403 for moderator", async () => {
    const app = makeApp(db, "moderator",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/rotate-expired-keys", { method: "POST", },),
    );
    expect(res.status,).toBe(403,);
  });

  test("POST /api/admin/rotate-expired-keys returns 200 for admin (with rotation enabled)", async () => {
    const config = { encryption: { keyRotationDays: 30, }, } as unknown as Config;
    const app = makeApp(db, "admin", config,);
    const res = await app.handle(
      new Request("http://localhost/api/admin/rotate-expired-keys", { method: "POST", },),
    );
    expect(res.status,).toBe(200,);
  });
},);
