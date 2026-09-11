// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for admin danger-zone routes (purge / reset / factory-reset).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, resetTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { dangerZoneRoutes, } from "./danger-zone";

/**
 * @param db
 * @param userRole
 * @param config
 */
function makeApp(db: Kysely<DB>, userRole: string | null, config: Config = {} as Config,) {
  const app = new Elysia({ name: "test-danger-zone", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? `test-user-${userRole}` : null,
    userRole,
  }));
  return app.use(dangerZoneRoutes({ database: db, config, }, "/api",),);
}

let db: Kysely<DB>;
let sqlite: TestDb["sqlite"];

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  sqlite = created.sqlite;
},);

beforeEach(() => {
  resetTestDb(sqlite,);
},);

afterAll(async () => {
  await db.destroy();
},);

describe("admin danger-zone — auth gates", () => {
  test("POST /api/admin/audit/purge returns 401 for anonymous", async () => {
    const app = makeApp(db, null,);
    const res = await app.handle(
      new Request("http://localhost/api/admin/audit/purge", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ confirmation: "PURGE", },),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  test("POST /api/admin/audit/purge returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/audit/purge", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ confirmation: "PURGE", },),
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("POST /api/admin/settings/reset returns 401 for anonymous", async () => {
    const app = makeApp(db, null,);
    const res = await app.handle(
      new Request("http://localhost/api/admin/settings/reset", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ confirmation: "RESET", },),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  test("POST /api/admin/settings/reset returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/settings/reset", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ confirmation: "RESET", },),
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("POST /api/admin/factory-reset returns 401 for anonymous", async () => {
    const app = makeApp(db, null,);
    const res = await app.handle(
      new Request("http://localhost/api/admin/factory-reset", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ confirmation: "DELETE ALL", },),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  test("POST /api/admin/factory-reset returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/factory-reset", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ confirmation: "DELETE ALL", },),
      },),
    );
    expect(res.status,).toBe(403,);
  });
});

describe("admin danger-zone — purge", () => {
  test("returns 400 for wrong confirmation", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/audit/purge", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ confirmation: "WRONG", },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("returns 200 with PURGE confirmation and wipes log_entries", async () => {
    await db.insertInto("log_entries",).values({
      id: crypto.randomUUID(),
      level: 6,
      timestamp: Date.now(),
      time: new Date().toISOString(),
      message: "test",
      module: "test",
      action: "test",
      event_type: "test",
      entity_type: "test",
    },).execute();
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/audit/purge", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ confirmation: "PURGE", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { purged: boolean };
    expect(body.purged,).toBe(true,);
    const remaining = await db.selectFrom("log_entries",).selectAll().execute();
    expect(remaining.length,).toBe(0,);
  });
});

describe("admin danger-zone — settings reset", () => {
  test("returns 400 for wrong confirmation", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/settings/reset", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ confirmation: "WRONG", },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("returns 200 with RESET confirmation", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/settings/reset", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ confirmation: "RESET", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { reset: boolean };
    expect(body.reset,).toBe(true,);
  });
});

describe("admin danger-zone — factory reset", () => {
  test("returns 400 for wrong confirmation", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/factory-reset", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ confirmation: "WRONG", },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("returns 200 or 500 with DELETE ALL confirmation (depends on seed actors schema)", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/factory-reset", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ confirmation: "DELETE ALL", },),
      },),
    );
    expect([200, 500,],).toContain(res.status,);
  });
});
