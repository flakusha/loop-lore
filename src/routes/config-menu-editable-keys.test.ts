// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Consumer-visible coverage for the four operator-editable config keys.
 * Each file owns its in-memory DB; no global caches are touched.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import { systemConfigRoutes, } from "./admin/system-config";
import { configMenuRoutes, } from "./config-menu";

interface EditableKey {
  key: string;
  section: string;
  value: unknown;
  stored: string;
  readback: unknown;
}

const EDITABLE_KEYS: EditableKey[] = [
  { key: "autoroute_scenario", section: "generation", value: "chat", stored: "chat", readback: "chat", },
  {
    key: "model_roles",
    section: "generation",
    value: { main: { provider: "local", model: "chat", }, },
    stored: '{"main":{"provider":"local","model":"chat"}}',
    readback: { main: { provider: "local", model: "chat", }, },
  },
  { key: "prompt_lore_budget", section: "prompt", value: 512, stored: "512", readback: "512", },
  { key: "prompt_memory_budget", section: "prompt", value: 768, stored: "768", readback: "768", },
];

function deriveRole(app: Elysia, userRole: string | null,) {
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? `editable-keys-${userRole}` : null,
    userRole,
  }));

  return app;
}

function menuApp(db: Kysely<DB>, userRole: string | null,) {
  return deriveRole(new Elysia({ name: "editable-keys-menu", },), userRole,)
    .use(configMenuRoutes({ database: db, },),);
}

function systemConfigApp(db: Kysely<DB>, userRole: string | null,) {
  return deriveRole(new Elysia({ name: "editable-keys-system-config", },), userRole,)
    .use(systemConfigRoutes({ database: db, config: {} as Config, }, "/api",),);
}

function patchMenu(app: ReturnType<typeof menuApp>, body: unknown,) {
  return app.handle(
    new Request("http://localhost/api/v1/config-menu", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

function patchSystemConfig(app: ReturnType<typeof systemConfigApp>, key: string,) {
  return app.handle(
    new Request("http://localhost/api/admin/system-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ key, value: "tampered", },),
    },),
  );
}

interface MenuField {
  key: string;
  editable: boolean;
  scope: string;
  default?: unknown;
}
interface MenuPayload {
  sections: { key: string; fields: MenuField[] }[];
}

let fixture: TestDb;
let db: Kysely<DB>;

beforeAll(async () => {
  fixture = await createTestDb();
  db = fixture.db;
},);

afterAll(async () => {
  await destroyTestDb(fixture,);
},);

describe("operator-editable config keys", () => {
  test("admin PATCH persists all four keys and GET shows the edited values", async () => {
    const app = menuApp(db, "admin",);
    for (const entry of EDITABLE_KEYS) {
      const res = await patchMenu(app, { key: entry.key, value: entry.value, },);
      expect(res.status,).toBe(200,);
      const patched = await res.json() as { ok: boolean; key: string };
      expect(patched.ok,).toBe(true,);
      expect(patched.key,).toBe(entry.key,);
    }

    for (const entry of EDITABLE_KEYS) {
      const row = await db.selectFrom("system_config",).select("value",).where("key", "=", entry.key,)
        .executeTakeFirst();

      expect(row?.value,).toBe(entry.stored,);
    }

    const get = await app.handle(new Request("http://localhost/api/v1/config-menu",),);
    expect(get.status,).toBe(200,);
    const body = await get.json() as MenuPayload;
    for (const entry of EDITABLE_KEYS) {
      const section = body.sections.find((s,) => s.key === entry.section);
      const field = section?.fields.find((f,) => f.key === entry.key);
      expect(field,).toBeDefined();
      expect(field?.editable,).toBe(true,);
      expect(field?.scope,).toBe("admin",);
      expect(field?.default,).toEqual(entry.readback,);
    }
  });

  test("non-editable admin keys stay rejected with 400 and not persisted", async () => {
    const app = menuApp(db, "admin",);
    for (const key of ["server.port", "generation.providers",]) {
      const res = await patchMenu(app, { key, value: "9999", },);
      expect(res.status,).toBe(400,);

      const row = await db.selectFrom("system_config",).select("key",).where("key", "=", key,)
        .executeTakeFirst();

      expect(row,).toBeUndefined();
    }
  });

  test("non-admin PATCH stays uniformly denied 400 and cannot change the keys", async () => {
    const app = menuApp(db, "user",);
    for (const entry of EDITABLE_KEYS) {
      const before = await db.selectFrom("system_config",).select("value",).where("key", "=", entry.key,)
        .executeTakeFirst();

      const res = await patchMenu(app, { key: entry.key, value: "tampered", },);
      expect(res.status,).toBe(400,);

      const after = await db.selectFrom("system_config",).select("value",).where("key", "=", entry.key,)
        .executeTakeFirst();

      expect(after?.value,).toBe(before?.value,);
    }
  });

  test("admin.system PATCH route denies non-admin with 403 and anonymous with 401", async () => {
    for (const entry of EDITABLE_KEYS) {
      const denied = await patchSystemConfig(systemConfigApp(db, "user",), entry.key,);
      expect(denied.status,).toBe(403,);
      const anonymous = await patchSystemConfig(systemConfigApp(db, null,), entry.key,);
      expect(anonymous.status,).toBe(401,);
    }
  });

  test("unauthenticated config-menu PATCH returns 401 for each new key", async () => {
    const app = menuApp(db, null,);
    for (const entry of EDITABLE_KEYS) {
      expect((await patchMenu(app, { key: entry.key, value: "x", },)).status,).toBe(401,);
    }
  });

  test("invalid body shape is rejected before the config-menu handler", async () => {
    const app = menuApp(db, "admin",);
    expect((await patchMenu(app, { value: "x", },)).status,).toBe(422,);
    expect((await patchMenu(app, { key: 42, value: "x", },)).status,).toBe(422,);

    const row = await db.selectFrom("system_config",).select("key",).where("key", "=", "42",)
      .executeTakeFirst();

    expect(row,).toBeUndefined();
  });
});
