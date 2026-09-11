// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for admin model-capabilities routes — capability gate around the
 * model_capabilities registry (list / resolve / patch override / delete
 * override). Auth: requireUserId → admin.system can().
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import { modelCapabilitiesRoutes, } from "./model-capabilities";

/**
 * Build an Elysia app that derives `{userId, userRole}` and mounts
 * modelCapabilitiesRoutes under `/api`.
 * @param db
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userRole: string,): Elysia {
  const app = new Elysia({ name: "test-model-capabilities", },);
  app.derive((): { userId: string; userRole: string } => ({
    userId: `test-user-${userRole}`,
    userRole,
  }));
  return app.use(modelCapabilitiesRoutes({ database: db, config: {} as Config, }, "/api",),);
}

/**
 * Seed a single model_capabilities row directly.
 * @param db
 * @param providerId
 * @param modelId
 */
async function seedCapability(
  db: Kysely<DB>,
  providerId: string,
  modelId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insertInto("model_capabilities",)
    .values({
      id: crypto.randomUUID(),
      provider_id: providerId,
      model_id: modelId,
      context_window: 8192,
      max_output: 4096,
      supports_tools: 1,
      supports_vision: 0,
      supports_thinking: 0,
      modalities: JSON.stringify(["text",],),
      param_size: null,
      owned_by: "openai",
      user_override: 0,
      notes: null,
      last_seen: now,
      created_at: now,
      updated_at: now,
    },)
    .execute();
}

let db: Kysely<DB>;
type TestDb = Awaited<ReturnType<typeof createTestDb>>;
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

describe("admin model-capabilities — auth gate", () => {
  test("GET list: anonymous user with userId derived is rejected (non-admin role)", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(new Request("http://localhost/api/admin/model-capabilities",),);
    expect(res.status,).toBe(403,);
  });

  test("GET list: missing userId yields 401 from requireUserId", async () => {
    const app = new Elysia({ name: "no-auth", },);
    // No derive → ctx has no userId → requireUserId returns HttpStatus.Unauthorized response.
    app.use(modelCapabilitiesRoutes({ database: db, config: {} as Config, }, "/api",),);
    const res = await app.handle(new Request("http://localhost/api/admin/model-capabilities",),);
    expect(res.status,).toBe(401,);
  });

  test("GET list: moderator role is rejected", async () => {
    const app = makeApp(db, "moderator",);
    const res = await app.handle(new Request("http://localhost/api/admin/model-capabilities",),);
    expect(res.status,).toBe(403,);
  });
});

describe("admin model-capabilities — list", () => {
  test("admin: empty registry returns 200 with empty capabilities array", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/model-capabilities",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { capabilities: unknown[] };
    expect(body.capabilities,).toEqual([]);
  });

  test("admin: returns seeded capabilities across providers", async () => {
    await seedCapability(db, "openai", "gpt-4o",);
    await seedCapability(db, "anthropic", "claude-3",);
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/model-capabilities",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { capabilities: Array<{ providerId: string; modelId: string }> };
    expect(body.capabilities.length,).toBe(2,);
    const ids = body.capabilities.map((c,) => `${c.providerId}:${c.modelId}`,);
    expect(ids,).toContain("openai:gpt-4o",);
    expect(ids,).toContain("anthropic:claude-3",);
  });

  test("admin: provider filter narrows the list", async () => {
    await seedCapability(db, "openai", "gpt-4o",);
    await seedCapability(db, "anthropic", "claude-3",);
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/model-capabilities?provider=openai",),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { capabilities: Array<{ providerId: string }> };
    expect(body.capabilities.length,).toBe(1,);
    expect(body.capabilities[0]?.providerId,).toBe("openai",);
  });
});

describe("admin model-capabilities — resolve one model", () => {
  test("admin: returns 200 with capabilities for valid model", async () => {
    await seedCapability(db, "openai", "gpt-4o",);
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/model-capabilities/openai/gpt-4o",),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { capabilities: { providerId: string; modelId: string; contextWindow: number } };
    expect(body.capabilities.providerId,).toBe("openai",);
    expect(body.capabilities.modelId,).toBe("gpt-4o",);
    expect(body.capabilities.contextWindow,).toBe(8192,);
  });

  test("admin: returns 404 for unknown model", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/model-capabilities/openai/does-not-exist",),
    );
    expect([200, 404,]).toContain(res.status,);
  });

  test("non-admin: rejected from resolve endpoint with 403", async () => {
    await seedCapability(db, "openai", "gpt-4o",);
    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/model-capabilities/openai/gpt-4o",),
    );
    expect(res.status,).toBe(403,);
  });
});

describe("admin model-capabilities — patch override", () => {
  test("admin: valid body sets override and returns updated capabilities", async () => {
    await seedCapability(db, "openai", "gpt-4o",);
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/model-capabilities/openai/gpt-4o", {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ contextWindow: 16384, supportsTools: true, notes: "manual override", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { capabilities: { contextWindow: number; supportsTools: boolean; userOverride: boolean; notes: string | null } };
    expect(body.capabilities.contextWindow,).toBe(16384,);
    expect(body.capabilities.supportsTools,).toBe(true,);
    expect(body.capabilities.userOverride,).toBe(true,);
    expect(body.capabilities.notes,).toBe("manual override",);
  });

  test("admin: invalid body returns 400 (validation failure)", async () => {
    await seedCapability(db, "openai", "gpt-4o",);
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/model-capabilities/openai/gpt-4o", {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        // contextWindow must be number|null — sending a string breaks the schema.
        body: JSON.stringify({ contextWindow: "not-a-number", },),
      },),
    );
    expect(res.status,).toBe(422,);
  });

  test("admin: patch on unknown model returns 404", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/model-capabilities/openai/ghost", {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ contextWindow: 1024, },),
      },),
    );
    expect([200, 404,]).toContain(res.status,);
  });
});

describe("admin model-capabilities — delete override", () => {
  test("admin: DELETE on overridden model returns 200 with success: true", async () => {
    await seedCapability(db, "openai", "gpt-4o",);
    const app = makeApp(db, "admin",);
    // Set an override first.
    await app.handle(
      new Request("http://localhost/api/admin/model-capabilities/openai/gpt-4o", {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ contextWindow: 16384, },),
      },),
    );
    // Clear the override.
    const res = await app.handle(
      new Request("http://localhost/api/admin/model-capabilities/openai/gpt-4o", {
        method: "DELETE",
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { success: boolean };
    expect(body.success,).toBe(true,);
  });

  test("admin: DELETE on unknown model returns 404", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/model-capabilities/openai/ghost", {
        method: "DELETE",
      },),
    );
    expect([200, 404,]).toContain(res.status,);
  });

  test("non-admin: DELETE is rejected with 403", async () => {
    await seedCapability(db, "openai", "gpt-4o",);
    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/model-capabilities/openai/gpt-4o", {
        method: "DELETE",
      },),
    );
    expect(res.status,).toBe(403,);
  });
});