// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for config-menu routes.
 *
 * Verifies:
 *   - GET 401 for anonymous
 *   - GET 200 admin sees all sections
 *   - GET 200 user sees only user-scope sections
 *   - PATCH 401 for anonymous
 *   - PATCH 403 for non-admin writing admin-scope key
 *   - PATCH 200 admin writes system_config
 *   - PATCH 200 user writes settings
 *   - PATCH 400 unknown key
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, type TestDb, } from "../test-utils/create-test-db";
import { configMenuRoutes, } from "./config-menu";

function makeApp(db: Kysely<DB>, userRole: string | null,) {
  const app = new Elysia({ name: "test-config-menu", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? `test-user-${userRole}` : null,
    userRole,
  }));

  return app.use(configMenuRoutes({ database: db, },),);
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

describe("config-menu routes", () => {
  test("GET /api/config-menu returns 401 for anonymous", async () => {
    const app = makeApp(db, null,);
    const res = await app.handle(new Request("http://localhost/api/config-menu",),);
    expect(res.status,).toBe(401,);
  });

  test("GET /api/config-menu returns admin sections for admin", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/config-menu",),);
    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(body.role,).toBe("admin",);
    expect(body.sections.length,).toBeGreaterThan(1,);
    const authSection = body.sections.find((s: { key: string },) => s.key === "auth",);
    expect(authSection,).toBeDefined();
    const regOpen = authSection.fields.find((f: { key: string },) => f.key === "registration_open",);
    expect(regOpen,).toBeDefined();
    expect(regOpen.editable,).toBe(true,);
  });

  test("GET /api/config-menu returns only user sections for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(new Request("http://localhost/api/config-menu",),);
    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(body.role,).toBe("user",);
    expect(body.sections.length,).toBe(1,);
    expect(body.sections[0].key,).toBe("preferences",);
    expect(body.sections[0].scope,).toBe("user",);
  });

  test("PATCH /api/config-menu returns 401 for anonymous", async () => {
    const app = makeApp(db, null,);
    const res = await app.handle(
      new Request("http://localhost/api/config-menu", { method: "PATCH", headers: { "Content-Type": "application/json", }, body: JSON.stringify({ key: "theme", value: "dark", },), },),
    );

    expect(res.status,).toBe(401,);
  });

  test("PATCH /api/config-menu returns 403 for non-admin writing admin key", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/config-menu", { method: "PATCH", headers: { "Content-Type": "application/json", }, body: JSON.stringify({ key: "registration_open", value: "true", },), },),
    );

    expect(res.status,).toBe(403,);
  });

  test("PATCH /api/config-menu returns 400 for unknown key", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/config-menu", { method: "PATCH", headers: { "Content-Type": "application/json", }, body: JSON.stringify({ key: "nonexistent_key", value: "x", },), },),
    );

    expect(res.status,).toBe(400,);
  });

  test("PATCH /api/config-menu rejects non-editable admin field", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/config-menu", { method: "PATCH", headers: { "Content-Type": "application/json", }, body: JSON.stringify({ key: "server.port", value: "9999", },), },),
    );

    expect(res.status,).toBe(400,);
    const rows = await db.selectFrom("system_config",).select("key",).where("key", "=", "server.port",).execute();
    expect(rows.length,).toBe(0,);
  });

  test("PATCH /api/config-menu admin writes system_config", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/config-menu", { method: "PATCH", headers: { "Content-Type": "application/json", }, body: JSON.stringify({ key: "registration_open", value: "true", },), },),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(body.ok,).toBe(true,);
    expect(body.key,).toBe("registration_open",);
  });

  test("PATCH /api/config-menu user writes settings", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/config-menu", { method: "PATCH", headers: { "Content-Type": "application/json", }, body: JSON.stringify({ key: "theme", value: "dark", },), },),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(body.ok,).toBe(true,);
    expect(body.key,).toBe("theme",);
  });
});
