/**
 * Tests for admin model-roles routes (override management).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertModelRoleOverrides, insertUsers, } from "../../test-utils/insert-helpers";
import { modelRolesRoutes, } from "./model-roles";

// Fake provider registration via the real registry (registration is global
// and idempotent per name).
import { getProvider, registerProvider, unregisterProvider, } from "../../generation/providers/registry";
import type { LLMProvider, } from "../../generation/providers/types";

/** */
function fakeProvider(): LLMProvider {
  return {
    name: "fake-provider",
    capabilities: { label: "Fake", supports: [], },

    generate: async (_prompt: string, _opts?: unknown,) => ({ text: "x", stopReason: "stop" as const, }),

    chat: async (_messages: unknown[], _opts?: unknown,) => ({ text: "x", stopReason: "stop" as const, }),
    healthCheck: async () => ({ status: "ok" as const, latencyMs: 1, }),
    listModels: async () => ["m1",],
  } as unknown as LLMProvider;
}

/**
 * @param db
 * @param userRole
 * @param config
 */
function makeApp(db: Kysely<DB>, userRole: string, config: Config,) {
  const app = new Elysia({ name: "test-model-roles", },);
  app.derive(() => ({ userRole, }));
  return app.use(modelRolesRoutes({ database: db, config, },),);
}

const mockConfig = {
  generation: {
    defaultProvider: "default-prov",
    defaultModels: { "default-prov": "dm", },
    modelRoles: {},
  },
} as unknown as Config;

interface OverrideBody {
  roles?: { role: string; provider: string; model: string; source: string }[];
  overrides?: Record<string, { provider: string; model: string; temperature: number | null; maxTokens: number | null }>;
  validRoles?: string[];
  ok?: boolean;
  role?: string;
  config?: { role: string; provider: string; model: string; source: string } | null;
  error?: string;
}

// Bun's mock.module is process-global and cannot be unmocked: without
// --isolate, an earlier file (e.g. admin/provider-health-isolated.test.ts)
// may have replaced the provider registry with fakes whose register/get
// are disconnected. Sentinel roundtrip: register + read back; skip when
// the registry is a stub instead of asserting against it
// (pristine-module guard; see generation/providers/registry.test.ts).
const REGISTRY_PROBE_PROVIDER = "__registry_pristine_probe__";
const registryPristine = (() => {
  try {
    // Registry stubs export only listProviders/getProvider — a missing
    // register/unregister means stubbed.
    if (typeof registerProvider !== "function" || typeof unregisterProvider !== "function") { return false; }
    registerProvider(REGISTRY_PROBE_PROVIDER, fakeProvider(),);
    const hit = getProvider(REGISTRY_PROBE_PROVIDER,) !== undefined;
    unregisterProvider(REGISTRY_PROBE_PROVIDER,);
    return hit;
  } catch {
    return false;
  }
})(); 
const describeReal = registryPristine ? describe : describe.skip;

describeReal("admin model-roles routes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "admin-user", "Admin", { id: "admin-user" as never, },);
    await insertUsers(db, "plain-user", "Plain", { id: "plain-user" as never, },);
    registerProvider("fake-provider", fakeProvider(),);
    if (!getProvider("default-prov",)) {
      registerProvider("default-prov", fakeProvider(),);
    }
    await insertModelRoleOverrides(db, "fake-provider", "m-main", { role: "main" as never, },);
  },);

  afterAll(async () => {
    // The registry is process-global: leftover fake providers would flip
    // isLlmGenerationConfigured() to true for every later test file.
    unregisterProvider("fake-provider",);
    unregisterProvider("default-prov",);
    await db.destroy();
    sqlite.close();
  },);

  describe("GET /admin/model-roles", () => {
    test("403 for non-admin", async () => {
      const app = makeApp(db, "user", mockConfig,);
      const res = await app.handle(new Request("http://localhost/api/admin/model-roles",),);
      expect(res.status,).toBe(403,);
    });

    test("returns resolved roles, overrides and valid roles for admin", async () => {
      const app = makeApp(db, "admin", mockConfig,);
      const res = await app.handle(new Request("http://localhost/api/admin/model-roles",),);
      const body = await res.json() as OverrideBody;
      expect(body.roles,).toHaveLength(3,);
      const main = body.roles!.find(r => r.role === "main");
      expect(main!.provider,).toBe("fake-provider",);
      expect(main!.source,).toBe("db",);
      expect(body.overrides,).toEqual({
        main: { provider: "fake-provider", model: "m-main", temperature: null, maxTokens: null, },
      },);
      expect(body.validRoles,).toContain("main",);
    });

    test("falls back to config defaults when no DB override", async () => {
      const app = makeApp(db, "admin", {
        generation: {
          defaultProvider: "default-prov",
          defaultModels: { "default-prov": "dm", },
          modelRoles: { captioning: { provider: "default-prov", model: "cm", }, },
        },
      } as unknown as Config,);
      const res = await app.handle(new Request("http://localhost/api/admin/model-roles",),);
      const body = await res.json() as OverrideBody;
      const caption = body.roles!.find(r => r.role === "captioning");
      expect(caption!.provider,).toBe("default-prov",);
      expect(caption!.source,).toBe("config",);
    });
  });

  describe("GET /admin/model-roles/:role", () => {
    test("400 for invalid role", async () => {
      const app = makeApp(db, "admin", mockConfig,);
      const res = await app.handle(new Request("http://localhost/api/admin/model-roles/bogus",),);
      expect(res.status,).toBe(400,);
    });

    test("returns role config for valid role", async () => {
      const app = makeApp(db, "admin", mockConfig,);
      const res = await app.handle(new Request("http://localhost/api/admin/model-roles/main",),);
      const body = await res.json() as OverrideBody;
      expect(body.role,).toBe("main",);
      expect(body.config!.provider,).toBe("fake-provider",);
    });

    test("403 for non-admin", async () => {
      const app = makeApp(db, "user", mockConfig,);
      const res = await app.handle(new Request("http://localhost/api/admin/model-roles/main",),);
      expect(res.status,).toBe(403,);
    });
  });

  describe("PUT /admin/model-roles/:role", () => {
    test("sets an override", async () => {
      const app = makeApp(db, "admin", mockConfig,);
      const res = await app.handle(
        new Request("http://localhost/api/admin/model-roles/main", {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ provider: "fake-provider", model: "updated-model", },),
        },),
      );
      const body = await res.json() as OverrideBody;
      expect(body.ok,).toBe(true,);

      const check = await app.handle(new Request("http://localhost/api/admin/model-roles",),);
      const checkBody = await check.json() as OverrideBody;
      expect(checkBody.overrides!.main,).toEqual({
        provider: "fake-provider",
        model: "updated-model",
        temperature: null,
        maxTokens: null,
      },);
    });

    test("400 when provider not registered", async () => {
      const app = makeApp(db, "admin", mockConfig,);
      const res = await app.handle(
        new Request("http://localhost/api/admin/model-roles/main", {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ provider: "ghost-provider", model: "x", },),
        },),
      );
      expect(res.status,).toBe(400,);
    });

    test("400 for invalid role", async () => {
      const app = makeApp(db, "admin", mockConfig,);
      const res = await app.handle(
        new Request("http://localhost/api/admin/model-roles/bogus", {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ provider: "fake-provider", model: "x", },),
        },),
      );
      expect(res.status,).toBe(400,);
    });

    test("403 for non-admin", async () => {
      const app = makeApp(db, "user", mockConfig,);
      const res = await app.handle(
        new Request("http://localhost/api/admin/model-roles/main", {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ provider: "fake-provider", model: "x", },),
        },),
      );
      expect(res.status,).toBe(403,);
    });
  });

  describe("DELETE /admin/model-roles/:role", () => {
    test("clears an override and returns 204", async () => {
      const app = makeApp(db, "admin", mockConfig,);
      const res = await app.handle(
        new Request("http://localhost/api/admin/model-roles/main", { method: "DELETE", },),
      );
      expect(res.status,).toBe(204,);

      const check = await app.handle(new Request("http://localhost/api/admin/model-roles",),);
      const checkBody = await check.json() as OverrideBody;
      expect(checkBody.overrides!.main,).toBeUndefined();
    });

    test("400 for invalid role", async () => {
      const app = makeApp(db, "admin", mockConfig,);
      const res = await app.handle(
        new Request("http://localhost/api/admin/model-roles/bogus", { method: "DELETE", },),
      );
      expect(res.status,).toBe(400,);
    });

    test("403 for non-admin", async () => {
      const app = makeApp(db, "user", mockConfig,);
      const res = await app.handle(
        new Request("http://localhost/api/admin/model-roles/main", { method: "DELETE", },),
      );
      expect(res.status,).toBe(403,);
    });
  });
},);
