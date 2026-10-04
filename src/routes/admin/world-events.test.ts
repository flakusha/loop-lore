// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for admin world-events routes.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertUsers, insertWorldEventLog, insertWorlds, } from "../../test-utils/insert-helpers";
import { worldEventsRoutes, } from "./world-events";

function makeApp(db: Kysely<DB>, userRole: string | null,) {
  const app = new Elysia({ name: "test-world-events", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? `test-user-${userRole}` : null,
    userRole,
  }));

  return app.use(worldEventsRoutes({ database: db, config: {} as Config, }, "/api",),);
}

let db: Kysely<DB>;
let sqlite: TestDb["sqlite"];
const TEST_USER = "00000000-0000-0000-0000-000000000050";
const TEST_WORLD = "00000000-0000-0000-0000-000000000051";

beforeAll(async () => {
  const tdb = await createTestDb();
  db = tdb.db;
  sqlite = tdb.sqlite;
  await insertUsers(db, "wren", "Wren", { id: TEST_USER, },);
  await insertWorlds(db, TEST_USER, "Eldoria", { id: TEST_WORLD, },);
  await insertWorldEventLog(db, TEST_WORLD, "location:discovered", 1, "key-1",);
  await insertWorldEventLog(db, TEST_WORLD, "trade:route", 2, "key-2",);
  await insertWorldEventLog(db, TEST_WORLD, "location:discovered", 3, "key-3",);
},);

afterAll(() => {
  sqlite.close();
},);

describe("admin world-events routes", () => {
  test("GET /api/admin/world-events returns 401 for anonymous", async () => {
    const app = makeApp(db, null,);
    const res = await app.handle(new Request("http://localhost/api/admin/world-events?world_id=" + TEST_WORLD,),);
    expect(res.status,).toBe(401,);
  });

  test("GET /api/admin/world-events returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(new Request("http://localhost/api/admin/world-events?world_id=" + TEST_WORLD,),);
    expect(res.status,).toBe(403,);
  });

  test("GET /api/admin/world-events returns 400 when world_id is missing", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/world-events",),);
    expect(res.status,).toBe(400,);
  });

  test("GET /api/admin/world-events returns 200 for admin with events", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/world-events?world_id=" + TEST_WORLD,),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: unknown[]; total: number };
    expect(Array.isArray(body.data,),).toBe(true,);
    expect(body.total,).toBe(3,);
    expect(body.data.length,).toBeGreaterThanOrEqual(1,);
  });

  test("GET /api/admin/world-events?event_type= filters by type", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/world-events?world_id=" + TEST_WORLD + "&event_type=trade:route",),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: { event_type: string }[]; total: number };
    expect(body.total,).toBe(1,);
    expect(body.data[0].event_type,).toBe("trade:route",);
  });

  test("GET /api/admin/world-events returns empty for unknown world", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/world-events?world_id=00000000-0000-0000-0000-000000000999",),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: unknown[]; total: number };
    expect(body.total,).toBe(0,);
    expect(body.data,).toEqual([],);
  });
});
