// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for admin/providers routes including the public GET /api/providers.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { resetHealthCache, scanAllProviders, } from "../../admin/provider-health";
import type { DB, } from "../../db/schema";
import { registerProvider, unregisterProvider, } from "../../generation/providers/registry";
import type { LLMProvider, } from "../../generation/providers/types";
import { createTestDb, } from "../../test-utils/create-test-db";
import { describeOrSkip, } from "../../test-utils/isolate-only";
// The rescan test must work with an empty registry; registry-mutating suites
// are gated below.
import { providersRoutes, } from "./providers";

/**
 * @param database
 */
function makeApp(database: Kysely<DB>,) {
  const app = new Elysia({ name: "test-providers", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({ userId: "test-user", userRole: "admin", }));
  return app.use(providersRoutes({ database, },),);
}

/**
 * @param userRole
 */
function makeAppWithRole(database: Kysely<DB>, userRole: string | null,) {
  const app = new Elysia({ name: "test-providers-role", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? `test-user-${userRole}` : null,
    userRole,
  }));

  return app.use(providersRoutes({ database, },),);
}

/** */
const FAKE_NAME = "test-fake-provider";

/** Provider registered by the gated registry suite at the bottom of this file. */
const COV_PROVIDER = "test-cov-provider";

/**
 * Minimal LLMProvider double: a healthy check plus two listed models, enough
 * for scanAllProviders() to populate the health cache the routes read.
 * @returns provider double
 */
function makeCoverageProvider(): LLMProvider {
  return {
    capabilities: {
      type: "openai-compatible",
      label: "Coverage Provider",
      text: true,
      image: false,
      embeddings: false,
      streaming: true,
      tools: false,
      thinking: false,
    },
    healthCheck: async () => ({ status: "ok" as const, latencyMs: 42, }),
    listModels: async () => [{ id: "cov-model-1", }, { id: "cov-model-2", },],
  } as unknown as LLMProvider;
}

let db: Kysely<DB>;
let sqlite: Database;

beforeAll(async () => {
  ({ db, sqlite, } = await createTestDb());
},);

afterAll(() => {
  sqlite.close();
},);

describe("providers routes", () => {
  describe("GET /api/providers (public, no auth)", () => {
    test("returns 200 with providers array", async () => {
      const app = makeApp(db,);
      const res = await app.handle(new Request("http://localhost/api/providers",),);
      expect(res.status,).toBe(200,);
      const body = await res.json() as { providers: unknown[] };
      expect(body.providers,).toBeDefined();
      expect(Array.isArray(body.providers,),).toBe(true,);
    });

    test("each provider has name, label, status", async () => {
      const app = makeApp(db,);
      const res = await app.handle(new Request("http://localhost/api/providers",),);
      const body = await res.json() as {
        providers: { name: string; label: string; status: string }[];
      };

      for (const p of body.providers) {
        expect(typeof p.name,).toBe("string",);
        expect(typeof p.label,).toBe("string",);
        expect(["healthy", "unreachable", "error", "unknown",],).toContain(p.status,);
      }
    });

    test("does not require authentication", async () => {
      const app = makeApp(db,);
      const res = await app.handle(
        new Request("http://localhost/api/providers", {
          headers: { Accept: "application/json", },
        },),
      );

      expect(res.status,).toBe(200,);
    });

    test("does not expose model details (only name/label/status)", async () => {
      const app = makeApp(db,);
      const res = await app.handle(new Request("http://localhost/api/providers",),);
      const body = await res.json() as {
        providers: { name: string; label: string; status: string; models?: unknown[] }[];
      };

      for (const p of body.providers) {
        // Public endpoint should NOT expose models array or capabilities
        expect(p.models,).toBeUndefined();
      }
    });
  });

  describe("GET /api/admin/providers (admin only)", () => {
    test("returns 401 for anonymous", async () => {
      const app = makeAppWithRole(db, null,);
      const res = await app.handle(new Request("http://localhost/api/admin/providers",),);
      expect(res.status,).toBe(401,);
    });

    test("returns 403 for non-admin", async () => {
      const app = makeAppWithRole(db, "user",);
      const res = await app.handle(new Request("http://localhost/api/admin/providers",),);
      expect(res.status,).toBe(403,);
    });

    test("returns 403 for moderator", async () => {
      const app = makeAppWithRole(db, "moderator",);
      const res = await app.handle(new Request("http://localhost/api/admin/providers",),);
      expect(res.status,).toBe(403,);
    });

    test("returns 200 with full provider list for admin", async () => {
      const app = makeAppWithRole(db, "admin",);
      const res = await app.handle(new Request("http://localhost/api/admin/providers",),);
      expect(res.status,).toBe(200,);
      const body = await res.json() as {
        providers: { name: string; label: string; capabilities: unknown; status: string }[];
      };

      expect(Array.isArray(body.providers,),).toBe(true,);
      for (const p of body.providers) {
        expect(typeof p.name,).toBe("string",);
        expect(typeof p.label,).toBe("string",);
        expect(p.capabilities,).toBeDefined();
        expect(typeof p.status,).toBe("string",);
      }
    });

    test("exposes capabilities object (admin detail)", async () => {
      const app = makeAppWithRole(db, "admin",);
      const res = await app.handle(new Request("http://localhost/api/admin/providers",),);
      const body = await res.json() as {
        providers: { capabilities: { label?: string } }[];
      };

      const withCaps = body.providers.filter((p,) => p.capabilities !== null && typeof p.capabilities === "object");
      expect(withCaps.length,).toBe(body.providers.length,);
    });
  });

  describe("GET /api/admin/providers/:name/models", () => {
    test("returns 401 for anonymous", async () => {
      const app = makeAppWithRole(db, null,);
      const res = await app.handle(
        new Request(`http://localhost/api/admin/providers/${FAKE_NAME}/models`,),
      );

      expect(res.status,).toBe(401,);
    });

    test("returns 403 for non-admin", async () => {
      const app = makeAppWithRole(db, "user",);
      const res = await app.handle(
        new Request(`http://localhost/api/admin/providers/${FAKE_NAME}/models`,),
      );

      expect(res.status,).toBe(403,);
    });

    test("returns 404 for unknown provider", async () => {
      const app = makeAppWithRole(db, "admin",);
      const res = await app.handle(
        new Request("http://localhost/api/admin/providers/unknown-provider-xyz/models",),
      );

      expect(res.status,).toBe(404,);
    });
  });

  describe("POST /api/admin/providers/rescan", () => {
    test("returns 401 for anonymous", async () => {
      const app = makeAppWithRole(db, null,);
      const res = await app.handle(
        new Request("http://localhost/api/admin/providers/rescan", { method: "POST", },),
      );

      expect(res.status,).toBe(401,);
    });

    test("returns 403 for non-admin", async () => {
      const app = makeAppWithRole(db, "user",);
      const res = await app.handle(
        new Request("http://localhost/api/admin/providers/rescan", { method: "POST", },),
      );

      expect(res.status,).toBe(403,);
    });

    test("returns 403 for moderator", async () => {
      const app = makeAppWithRole(db, "moderator",);
      const res = await app.handle(
        new Request("http://localhost/api/admin/providers/rescan", { method: "POST", },),
      );

      expect(res.status,).toBe(403,);
    });

    test("returns 200 with providers array for admin", async () => {
      const app = makeAppWithRole(db, "admin",);
      const res = await app.handle(
        new Request("http://localhost/api/admin/providers/rescan", { method: "POST", },),
      );

      expect(res.status,).toBe(200,);
      const body = await res.json() as { providers: unknown[] };
      expect(Array.isArray(body.providers,),).toBe(true,);
    });
  });
});

// The provider registry and the health cache are both process-global. This
// suite mutates them, so it runs only under per-file isolation and restores
// state after every test — a leftover provider would flip
// isLlmGenerationConfigured() for every later file in a shared process.
describeOrSkip("providers routes — populated registry + health cache", () => {
  beforeEach(() => {
    unregisterProvider(COV_PROVIDER,);
    resetHealthCache();
    registerProvider(COV_PROVIDER, makeCoverageProvider(),);
  },);

  afterEach(() => {
    unregisterProvider(COV_PROVIDER,);
    resetHealthCache();
  },);

  test("public list maps a registered provider and falls back to unknown status", async () => {
    const app = makeApp(db,);
    const res = await app.handle(new Request("http://localhost/api/providers",),);
    expect(res.status,).toBe(200,);

    const body = await res.json() as {
      providers: { name: string; label: string; status: string }[];
    };

    const mine = body.providers.find((p,) => p.name === COV_PROVIDER);

    expect(mine,).toBeDefined();
    expect(mine!.label,).toBe("Coverage Provider",);
    expect(mine!.status,).toBe("unknown",);
  });

  test("admin list maps capabilities and cached health details", async () => {
    await scanAllProviders();

    const app = makeAppWithRole(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/providers",),);
    expect(res.status,).toBe(200,);

    const body = await res.json() as {
      providers: {
        name: string;
        label: string;
        capabilities: { label: string };
        status: string;
        modelCount: number;
        latencyMs?: number;
        lastChecked?: string;
        error?: string;
      }[];
    };

    const mine = body.providers.find((p,) => p.name === COV_PROVIDER);

    expect(mine,).toBeDefined();
    expect(mine!.capabilities.label,).toBe("Coverage Provider",);
    expect(mine!.status,).toBe("healthy",);
    expect(mine!.modelCount,).toBe(2,);
    expect(mine!.latencyMs,).toBe(42,);
    expect(typeof mine!.lastChecked,).toBe("string",);
    expect(mine!.error,).toBeUndefined();
  });

  test("models endpoint returns 200 for a provider with a cached health entry", async () => {
    await scanAllProviders();

    const app = makeAppWithRole(db, "admin",);
    const res = await app.handle(
      new Request(`http://localhost/api/admin/providers/${COV_PROVIDER}/models`,),
    );

    expect(res.status,).toBe(200,);

    const body = await res.json() as {
      name: string;
      label: string;
      models: { id: string }[];
      status: string;
    };

    expect(body.name,).toBe(COV_PROVIDER,);
    expect(body.label,).toBe("Coverage Provider",);
    expect(body.models.map((m,) => m.id),).toEqual(["cov-model-1", "cov-model-2",],);
    expect(body.status,).toBe("healthy",);
  });
},);
