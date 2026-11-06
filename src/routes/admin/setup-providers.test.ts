// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the admin setup-provider routes — the wizard's backend surface.
 *
 * Verifies:
 *   - requirePermissionUserId 401 path
 *   - can(userRole, 'admin.system') 403 path
 *   - GET 200 (no secrets)
 *   - POST 200 (provider live in the registry, key sealed) / 400 (invalid body)
 *   - DELETE 204
 */
import { afterAll, afterEach, beforeAll, describe, expect, mock, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { setConfig, } from "../../admin/config";
import { resetHealthCache, } from "../../admin/provider-health";
import type { Config, ProviderInstanceConfig, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import { initSmk, } from "../../crypto/smk";
import type { DB, } from "../../db/schema";
import { OpenAiCompatibleProvider as RealProvider, } from "../../generation/providers/openai-compatible";
import { getProvider, unregisterProvider, } from "../../generation/providers/registry";
import {
  serverProviderDescriptorKey,
  serverProviderSecretKey,
} from "../../generation/providers/server-provider-store";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { setupProvidersRoutes, } from "./setup-providers";

/** The base URL whose provider construction always fails. */
const BROKEN_BASE_URL = "https://broken.example.com/v1";

/** The real provider class, captured before the mock below replaces it. */
const RealProviderClass = RealProvider;

if (ISOLATED) {
  // mock.module is process-global in bun: without per-file isolation this
  // stub would replace the provider class for every later test file. It only
  // refuses one base URL, so the rest of this file keeps the real class.
  mock.module("../../generation/providers/openai-compatible", () => ({
    OpenAiCompatibleProvider: class extends RealProviderClass {
      /**
       * @param config - the provider instance config
       * @throws {Error} When the instance points at the broken endpoint.
       */
      constructor(config: ProviderInstanceConfig,) {
        if (config.baseUrl === BROKEN_BASE_URL) {
          throw new Error("provider factory rejected the instance",);
        }

        super(config,);
      }
    },
  }),);
}

/** Provider names registered by a test — the registry is process-global. */
const registered: string[] = [];

/**
 * @param db
 * @param userRole
 * @returns an app exposing the setup-provider routes under /api/v1
 */
function makeApp(db: Kysely<DB>, userRole: string | null,) {
  const app = new Elysia({ name: "test-setup-providers", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? `test-user-${userRole}` : null,
    userRole,
  }));

  const config = structuredClone(createConfigSchema().defaults,) as Config;
  config.generation.providers.openaiCompatible = [];
  config.generation.defaultProvider = "";
  config.generation.defaultModels = {};

  return app.use(setupProvidersRoutes({ database: db, config, }, "/api/v1",),);
}

let db: Kysely<DB>;
let sqlite: TestDb["sqlite"];

beforeAll(async () => {
  const tdb = await createTestDb();
  db = tdb.db;
  sqlite = tdb.sqlite;
  await initSmk({
    serverEncryptionKey: "f".repeat(64,),
    required: false,
    compressThreshold: 1024,
    compressAlgorithm: "gzip",
  },);
},);

afterEach(() => {
  resetHealthCache();
  for (const name of registered.splice(0,)) {
    unregisterProvider(name,);
  }
},);

afterAll(async () => {
  await initSmk({ required: false, compressThreshold: 1024, compressAlgorithm: "gzip", },);
  sqlite.close();
},);

describe("admin setup-provider routes", () => {
  test("GET /api/v1/admin/setup/providers returns 401 for anonymous", async () => {
    const app = makeApp(db, null,);
    const res = await app.handle(new Request("http://localhost/api/v1/admin/setup/providers",),);
    expect(res.status,).toBe(401,);
  });

  test("GET /api/v1/admin/setup/providers returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(new Request("http://localhost/api/v1/admin/setup/providers",),);
    expect(res.status,).toBe(403,);
  });

  test("GET /api/v1/admin/setup/providers returns 200 with no providers", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/v1/admin/setup/providers",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { providers: unknown[] };
    expect(Array.isArray(body.providers,),).toBe(true,);
  });

  test("POST creates a live provider and stores the key sealed", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/v1/admin/setup/providers", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          name: "route-provider",
          label: "Route Provider",
          baseUrl: "https://api.example.com/v1",
          model: "demo-model",
          apiKey: "sk-route-value",
        },),
      },),
    );

    expect(res.status,).toBe(200,);
    registered.push("route-provider",);

    const body = await res.json() as { ok: boolean; provider: { name: string; hasApiKey: boolean } };
    expect(body.ok,).toBe(true,);
    expect(body.provider.name,).toBe("route-provider",);
    expect(body.provider.hasApiKey,).toBe(true,);
    expect(JSON.stringify(body,),).not.toContain("sk-route-value",);

    // The provider is live in the registry without a restart.
    expect(getProvider("route-provider",),).toBeDefined();

    const row = await db
      .selectFrom("system_config",)
      .select("value",)
      .where("key", "=", serverProviderSecretKey("route-provider",),)
      .executeTakeFirst();

    expect(row?.value,).toStartWith("secret:v1:",);
    expect(row?.value,).not.toContain("sk-route-value",);
  });

  test("POST returns 400 for an invalid body", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/v1/admin/setup/providers", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ name: "bad name!", baseUrl: "not-a-url", },),
      },),
    );

    expect(res.status,).toBe(400,);
  });

  test("POST returns 400 for a body that passes the schema but is not a usable URL", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/v1/admin/setup/providers", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          name: "bad-url-provider",
          label: "Bad URL",
          baseUrl: "not-a-url",
          model: "demo-model",
        },),
      },),
    );

    expect(res.status,).toBe(400,);
    expect(getProvider("bad-url-provider",),).toBeUndefined();
  });

  test("POST returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/v1/admin/setup/providers", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          name: "forbidden-provider",
          label: "Forbidden Provider",
          baseUrl: "https://api.example.com/v1",
          model: "demo-model",
        },),
      },),
    );

    expect(res.status,).toBe(403,);
  });

  test("DELETE removes the provider and returns 204", async () => {
    const app = makeApp(db, "admin",);
    const create = await app.handle(
      new Request("http://localhost/api/v1/admin/setup/providers", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          name: "deletable-provider",
          label: "Deletable Provider",
          baseUrl: "https://api.example.com/v1",
          model: "demo-model",
        },),
      },),
    );

    expect(create.status,).toBe(200,);
    registered.push("deletable-provider",);

    const res = await app.handle(
      new Request("http://localhost/api/v1/admin/setup/providers/deletable-provider", { method: "DELETE", },),
    );

    expect(res.status,).toBe(204,);
    expect(getProvider("deletable-provider",),).toBeUndefined();
  });

  test("DELETE returns 400 for an unknown provider", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/v1/admin/setup/providers/does-not-exist", { method: "DELETE", },),
    );

    expect(res.status,).toBe(400,);
  });

  test("POST returns 400 for an allowed host that is not a bare hostname", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/v1/admin/setup/providers", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          name: "wildcard-provider",
          label: "Wildcard Provider",
          baseUrl: "https://api.example.com/v1",
          model: "demo-model",
          allowedHosts: ["*",],
        },),
      },),
    );

    expect(res.status,).toBe(400,);
    expect(getProvider("wildcard-provider",),).toBeUndefined();
  });

  test("POST clears the stored key when an empty apiKey is sent", async () => {
    const app = makeApp(db, "admin",);
    const create = await app.handle(
      new Request("http://localhost/api/v1/admin/setup/providers", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          name: "cleared-route-provider",
          label: "Cleared Route Provider",
          baseUrl: "https://api.example.com/v1",
          model: "demo-model",
          apiKey: "sk-route-to-clear",
        },),
      },),
    );

    expect(create.status,).toBe(200,);
    registered.push("cleared-route-provider",);

    const clear = await app.handle(
      new Request("http://localhost/api/v1/admin/setup/providers", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          name: "cleared-route-provider",
          label: "Cleared Route Provider",
          baseUrl: "https://api.example.com/v1",
          model: "demo-model",
          apiKey: "",
        },),
      },),
    );

    expect(clear.status,).toBe(200,);
    const body = await clear.json() as { provider: { hasApiKey: boolean } };
    expect(body.provider.hasApiKey,).toBe(false,);
  });

  test("GET reports the live state of a stored provider", async () => {
    const app = makeApp(db, "admin",);
    const create = await app.handle(
      new Request("http://localhost/api/v1/admin/setup/providers", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          name: "stateful-provider",
          label: "Stateful Provider",
          baseUrl: "https://api.example.com/v1",
          model: "demo-model",
        },),
      },),
    );

    expect(create.status,).toBe(200,);
    registered.push("stateful-provider",);

    const res = await app.handle(new Request("http://localhost/api/v1/admin/setup/providers",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { providers: { name: string; state: string }[] };
    const descriptor = body.providers.find((entry,) => entry.name === "stateful-provider");
    expect(descriptor?.state,).toBe("live",);
  });
});

describeOrSkip("provider materialization failures", () => {
  afterEach(async () => {
    await db.deleteFrom("system_config",).where("key", "like", "provider.%",).execute();
  },);

  test("POST answers 502 with the real reason and leaves the provider not live", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/v1/admin/setup/providers", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          name: "broken-provider",
          label: "Broken Provider",
          baseUrl: BROKEN_BASE_URL,
          model: "demo-model",
          apiKey: "sk-broken-value",
        },),
      },),
    );

    expect(res.status,).toBe(502,);
    const body = await res.json() as { error: string; code: string };
    expect(body.error,).toContain("provider factory rejected the instance",);
    expect(body.code,).toBe("BAD_GATEWAY",);

    // The provider is not live and nothing was stored.
    expect(getProvider("broken-provider",),).toBeUndefined();
    const row = await db
      .selectFrom("system_config",)
      .select("value",)
      .where("key", "=", serverProviderDescriptorKey("broken-provider",),)
      .executeTakeFirst();

    expect(row,).toBeUndefined();
  });

  test("the listing carries the real reason a stored provider is not live", async () => {
    await setConfig(
      db,
      serverProviderDescriptorKey("broken-stored",),
      JSON.stringify({
        name: "broken-stored",
        label: "Broken Stored",
        baseUrl: BROKEN_BASE_URL,
        model: "demo-model",
        allowedHosts: ["broken.example.com",],
        timeout: 30_000,
        retries: 3,
        allowUserApiKey: true,
        setDefault: false,
      },),
    );

    await setConfig(db, serverProviderSecretKey("broken-stored",), "sk-broken-value",);

    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/v1/admin/setup/providers",),);
    expect(res.status,).toBe(200,);

    const body = await res.json() as { providers: { name: string; state: string; error?: string }[] };
    const entry = body.providers.find((provider,) => provider.name === "broken-stored");
    expect(entry?.state,).toBe("error",);
    expect(entry?.error,).toContain("provider factory rejected the instance",);
  });
},);
