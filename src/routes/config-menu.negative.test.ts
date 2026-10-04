// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Adversarial negative-space tests for config-menu routes.
 * Each test documents observed behavior for a specific attack/edge case.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, type TestDb, } from "../test-utils/create-test-db";
import { configMenuRoutes, } from "./config-menu";

function makeApp(db: Kysely<DB>, userRole: string | null,) {
  const app = new Elysia({ name: "test-config-menu-neg", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? `test-user-${userRole}` : null,
    userRole,
  },),);
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

describe("NEGATIVE SPACE — config-menu adversarial tests", () => {
  test("3a. admin PATCHes USER-scope key 'theme' — writes to admin's OWN settings?", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/config-menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ key: "theme", value: "dark", },),
      },),
    );
    console.log("3a. admin PATCH theme status:", res.status,);
    const body = await res.json() as { ok?: boolean; key?: string; error?: string; };
    console.log("3a. response body:", JSON.stringify(body,),);

    // Check if admin's settings were written
    const adminUser = await db.selectFrom("users",).select("settings",).where("id", "=", "test-user-admin",).executeTakeFirst();
    console.log("3a. admin settings after PATCH:", adminUser?.settings,);

    // Check if system_config was written (should NOT be for user-scope key)
    const sysConfig = await db.selectFrom("system_config",).select("value",).where("key", "=", "theme",).executeTakeFirst();
    console.log("3a. system_config theme:", sysConfig?.value,);

    expect(res.status,).toBe(200,);
  },);

  test("3b. user PATCHes key NOT in SettingsUpdateAllowedKeys → 400?", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/config-menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ key: "isAdmin", value: "true", },),
      },),
    );
    console.log("3b. user PATCH isAdmin status:", res.status,);
    const body = await res.json() as { ok?: boolean; error?: string; };
    console.log("3b. response body:", JSON.stringify(body,),);
    expect(res.status,).toBe(400,);
  },);

  test("3c. coerceValue array/object — round-trip corruption?", async () => {
    // notifications is type "object" in USER_FIELD_TYPES
    const app = makeApp(db, "user",);
    const originalValue = { email: true, push: false, };
    const res = await app.handle(
      new Request("http://localhost/api/config-menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ key: "notifications", value: originalValue, },),
      },),
    );
    console.log("3c. user PATCH notifications (object) status:", res.status,);
    const body = await res.json() as { ok?: boolean; };
    console.log("3c. response body:", JSON.stringify(body,),);

    const user = await db.selectFrom("users",).select("settings",).where("id", "=", "test-user-user",).executeTakeFirst();
    console.log("3c. stored settings:", user?.settings,);

    // Parse and check round-trip
    if (user?.settings) {
      const parsed = JSON.parse(user.settings,) as Record<string, unknown>;
      console.log("3c. parsed notifications:", JSON.stringify(parsed.notifications,),);
      console.log("3c. original was:", JSON.stringify(originalValue,),);
      console.log("3c. MATCH?", JSON.stringify(parsed.notifications,) === JSON.stringify(originalValue,),);
    }

    expect(res.status,).toBe(200,);
  },);

  test("3d. coerceValue number — NaN persisted?", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/config-menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ key: "fontSize", value: "abc", },),
      },),
    );
    console.log("3d. user PATCH fontSize='abc' status:", res.status,);
    const body = await res.json() as { ok?: boolean; };
    console.log("3d. response body:", JSON.stringify(body,),);

    const user = await db.selectFrom("users",).select("settings",).where("id", "=", "test-user-user",).executeTakeFirst();
    console.log("3d. stored settings:", user?.settings,);

    expect(res.status,).toBe(200,);
  },);

  test("3f. unauthenticated PATCH → 401?", async () => {
    const app = makeApp(db, null,);
    const res = await app.handle(
      new Request("http://localhost/api/config-menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ key: "theme", value: "dark", },),
      },),
    );
    console.log("3f. anon PATCH status:", res.status,);
    expect(res.status,).toBe(401,);
  },);

  test("3f2. anonymous GET → 401?", async () => {
    const app = makeApp(db, null,);
    const res = await app.handle(new Request("http://localhost/api/config-menu",),);
    console.log("3f2. anon GET status:", res.status,);
    expect(res.status,).toBe(401,);
  },);

  test("3g. prototype-pollution key '__proto__' via PATCH", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/config-menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ key: "__proto__", value: "polluted", },),
      },),
    );
    console.log("3g. user PATCH __proto__ status:", res.status,);
    const body = await res.json() as { ok?: boolean; error?: string; };
    console.log("3g. response body:", JSON.stringify(body,),);

    // Check if it was rejected
    expect(res.status,).toBe(400,);
  },);

  test("3g2. prototype-pollution key 'constructor' via PATCH", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/config-menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ key: "constructor", value: "polluted", },),
      },),
    );
    console.log("3g2. user PATCH constructor status:", res.status,);
    const body = await res.json() as { ok?: boolean; error?: string; };
    console.log("3g2. response body:", JSON.stringify(body,),);
    expect(res.status,).toBe(400,);
  },);

  test("3h. user PATCH merge — concurrent keys preserved?", async () => {
    // First, set up a user with existing settings
    await db.updateTable("users",).set({
      settings: JSON.stringify({ theme: "light", fontSize: 14, locale: "en", },),
    },).where("id", "=", "test-user-user",).execute();

    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/config-menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ key: "theme", value: "dark", },),
      },),
    );
    console.log("3h. user PATCH theme (merge test) status:", res.status,);

    const user = await db.selectFrom("users",).select("settings",).where("id", "=", "test-user-user",).executeTakeFirst();
    console.log("3h. settings after merge:", user?.settings,);

    if (user?.settings) {
      const parsed = JSON.parse(user.settings,) as Record<string, unknown>;
      console.log("3h. theme:", parsed.theme, "(expected: dark)",);
      console.log("3h. fontSize:", parsed.fontSize, "(expected: 14 — preserved?)",);
      console.log("3h. locale:", parsed.locale, "(expected: en — preserved?)",);
    }

    expect(res.status,).toBe(200,);
  },);

  test("3i. admin PATCH user-scope key — does it check SettingsUpdateAllowedKeys?", async () => {
    // Admin patches "theme" — it's in user scope, so goes to user branch
    // But admin is not in SettingsUpdateAllowedKeys check? Let's see...
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/config-menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ key: "theme", value: "dark", },),
      },),
    );
    console.log("3i. admin PATCH theme status:", res.status,);
    const body = await res.json() as { ok?: boolean; key?: string; error?: string; };
    console.log("3i. response body:", JSON.stringify(body,),);

    // Check admin's settings
    const adminUser = await db.selectFrom("users",).select("settings",).where("id", "=", "test-user-admin",).executeTakeFirst();
    console.log("3i. admin settings:", adminUser?.settings,);

    expect(res.status,).toBe(200,);
  },);

  test("3j. user PATCH admin-scope key → 403?", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/config-menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ key: "registration_open", value: "true", },),
      },),
    );
    console.log("3j. user PATCH registration_open status:", res.status,);
    expect(res.status,).toBe(403,);
  },);

  test("3k. admin PATCH non-editable admin field → 400?", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/config-menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ key: "server.port", value: "9999", },),
      },),
    );
    console.log("3k. admin PATCH server.port status:", res.status,);
    expect(res.status,).toBe(400,);
  },);

  test("3l. GET /api/config-menu — admin sees 26 sections, 139 fields?", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/config-menu",),);
    const body = await res.json() as { role: string; sections: Array<{ key: string; fields: unknown[] }> };
    console.log("3l. admin role:", body.role,);
    console.log("3l. admin sections count:", body.sections.length,);
    const totalFields = body.sections.reduce((sum, s) => sum + s.fields.length, 0);
    console.log("3l. admin total fields:", totalFields,);
  },);

  test("3m. GET /api/config-menu — user sees 1 section, 15 fields?", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(new Request("http://localhost/api/config-menu",),);
    const body = await res.json() as { role: string; sections: Array<{ key: string; fields: unknown[] }> };
    console.log("3m. user role:", body.role,);
    console.log("3m. user sections count:", body.sections.length,);
    const totalFields = body.sections.reduce((sum, s) => sum + s.fields.length, 0);
    console.log("3m. user total fields:", totalFields,);
  },);
},);
