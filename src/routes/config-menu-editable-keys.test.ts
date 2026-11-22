// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Consumer-visible coverage for the four operator-editable config keys.
 * Each file owns its in-memory DB; no global caches are touched.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { resolveModelRole, } from "../admin/model-roles";
import { resolveSectionBudget, } from "../assistant/prompt/budgets";
import type { Config, } from "../config/schema";
import { ModelRole, } from "../db/enums-core";
import type { DB, } from "../db/schema";
import { recordRanking, } from "../models/rankings";
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
  { key: "lore_token_budget", section: "prompt", value: 512, stored: "512", readback: 512, },
  { key: "memory_token_budget", section: "prompt", value: 768, stored: "768", readback: 768, },
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
  type: string;
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

  test("PATCHed prompt budgets reach the effective prompt config", async () => {
    const app = menuApp(db, "admin",);
    for (
      const entry of [
        { key: "lore_token_budget", value: 640, },
        { key: "memory_token_budget", value: 896, },
      ]
    ) {
      const res = await patchMenu(app, { key: entry.key, value: entry.value, },);
      expect(res.status,).toBe(200,);
    }

    const config = {
      prompt: { loreTokenBudget: 1024, memoryTokenBudget: 1024, },
    } as unknown as Config;

    const ctx = {
      db,
      chat: { world_id: null, },
      config,
    } as unknown as Parameters<typeof resolveSectionBudget>[0];

    expect(await resolveSectionBudget(ctx, "lore",),).toBe(640,);
    expect(await resolveSectionBudget(ctx, "memory",),).toBe(896,);
    // File-plane config stays at its default: the override comes from the DB.
    expect(config.prompt?.loreTokenBudget,).toBe(1024,);
  });

  test("PATCHed modelRoles and autorouteScenario reach role resolution", async () => {
    const app = menuApp(db, "admin",);
    expect(
      (await patchMenu(app, {
        key: "model_roles",
        value: { main: { provider: "stored-provider", model: "stored-model", }, },
      },)).status,
    ).toBe(200,);

    const config = {
      generation: {
        defaultProvider: "stored-provider",
        defaultModels: { "stored-provider": "ranked-model", },
      },
    } as unknown as Config;

    const resolved = await resolveModelRole(ModelRole.Main, config, db,);
    expect(resolved.source,).toBe("config",);
    expect(resolved.provider,).toBe("stored-provider",);
    expect(resolved.model,).toBe("stored-model",);

    expect((await patchMenu(app, { key: "autoroute_scenario", value: "chat", },)).status,).toBe(200,);
    await recordRanking(db, {
      scope: "global",
      scopeKey: "editable-keys",
      subjectKey: "ranked-model",
      metric: "arena_score",
      value: 0.9,
      basis: "test",
      source: "test",
      observedAt: new Date().toISOString(),
    },);

    const ranked = await resolveModelRole(ModelRole.Auxiliary, config, db,);
    expect(ranked.source,).toBe("ranking",);
    expect(ranked.model,).toBe("ranked-model",);
  });

  test("budget fields render as numbers and round-trip through PATCH", async () => {
    const app = menuApp(db, "admin",);
    const keys = ["lore_token_budget", "memory_token_budget",];
    const before = await (await app.handle(new Request("http://localhost/api/v1/config-menu",),)).json() as MenuPayload;
    for (const key of keys) {
      const field = before.sections.flatMap((s,) => s.fields).find((f,) => f.key === key);
      expect(field?.type,).toBe("number",);
    }

    for (
      const [key, value, expected,] of [
        ["lore_token_budget", "128", 128,],
        ["memory_token_budget", "8192", 8192,],
      ] as const
    ) {
      expect((await patchMenu(app, { key, value, },)).status,).toBe(200,);
      const row = await db.selectFrom("system_config",).select("value",).where("key", "=", key,)
        .executeTakeFirst();

      expect(row?.value,).toBe(String(expected,),);
      const after = await (await app.handle(new Request("http://localhost/api/v1/config-menu",),))
        .json() as MenuPayload;

      const field = after.sections.flatMap((s,) => s.fields).find((f,) => f.key === key);
      expect(field?.default,).toBe(expected,);
    }
  });

  test("budget PATCH rejects invalid values with 400 and no write", async () => {
    const app = menuApp(db, "admin",);
    const key = "lore_token_budget";
    const before = await db.selectFrom("system_config",).select("value",).where("key", "=", key,)
      .executeTakeFirst();

    for (const value of [Number.NaN, -1, 8193, "abc", "NaN", 128.5, null,]) {
      const res = await patchMenu(app, { key, value, },);
      expect(res.status,).toBe(400,);
      const err = await res.json() as { error: string };
      expect(err.error,).toBe(
        `Invalid ${key}: expected an integer between 128 and 8192`,
      );
    }

    const after = await db.selectFrom("system_config",).select("value",).where("key", "=", key,)
      .executeTakeFirst();

    expect(after?.value,).toBe(before?.value,);
  });
});
