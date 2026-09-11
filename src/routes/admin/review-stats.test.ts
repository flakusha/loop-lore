// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for admin review-stats route.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { reviewStatsRoutes, } from "./review-stats";

/**
 * @param db
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userRole: string | null,) {
  const app = new Elysia({ name: "test-review-stats", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? `test-user-${userRole}` : null,
    userRole,
  }));
  return app.use(reviewStatsRoutes({ database: db, config: {} as Config, }, "/api",),);
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

describe("admin review-stats route", () => {
  test("GET /api/admin/review/stats returns 401 for anonymous", async () => {
    const app = makeApp(db, null,);
    const res = await app.handle(new Request("http://localhost/api/admin/review/stats",),);
    expect(res.status,).toBe(401,);
  });

  test("GET /api/admin/review/stats returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(new Request("http://localhost/api/admin/review/stats",),);
    expect(res.status,).toBe(403,);
  });

  test("GET /api/admin/review/stats returns 200 for admin (empty DB)", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/review/stats",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      pending: number;
      total: number;
      dismissed: number;
      resolved: number;
      falsePositiveRate: number;
      daily: unknown[];
      topContentTypes: unknown[];
    };
    expect(body.pending,).toBe(0,);
    expect(body.total,).toBe(0,);
    expect(body.falsePositiveRate,).toBe(0,);
    expect(Array.isArray(body.daily,),).toBe(true,);
    expect(Array.isArray(body.topContentTypes,),).toBe(true,);
  });

  test("GET /api/admin/review/stats returns 200 (table query succeeds)", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/review/stats",),);
    expect(res.status,).toBe(200,);
  });

  test("GET /api/admin/review/stats returns 403 for moderator", async () => {
    const app = makeApp(db, "moderator",);
    const res = await app.handle(new Request("http://localhost/api/admin/review/stats",),);
    expect(res.status,).toBe(403,);
  });
});
