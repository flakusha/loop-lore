// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the server provider materialization — probing a stored descriptor,
 * building the provider, registering it in the live list and pruning it again.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { setConfig, } from "../../admin/config";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import { initSmk, } from "../../crypto/smk";
import type { DB, } from "../../db/schema";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { getProvider, unregisterProvider, } from "./registry";
import {
  serverProviderDescriptorKey,
  ServerProviderValidationError,
  type StoredServerProvider,
} from "./server-provider-descriptor";
import {
  activateProvider,
  prepareProvider,
  probeProvider,
  readStoredProviders,
  removeServerProviderInstance,
  ServerProviderMaterializationError,
} from "./server-provider-materialize";

/**
 * @returns a config with no provider instances — the fresh-install shape
 */
function testConfig(): Config {
  const config = structuredClone(createConfigSchema().defaults,) as Config;
  config.generation.providers.openaiCompatible = [];
  config.generation.defaultProvider = "";
  config.generation.defaultModels = {};
  return config;
}

/**
 * @param overrides - descriptor fields to override
 * @returns a stored descriptor of an approved provider instance
 */
function storedProvider(overrides: Partial<StoredServerProvider> = {},): StoredServerProvider {
  return {
    name: "acme",
    label: "Acme",
    baseUrl: "https://api.example.com/v1",
    model: "demo-model",
    allowedHosts: ["api.example.com",],
    timeout: 30_000,
    retries: 3,
    allowUserApiKey: true,
    setDefault: false,
    ...overrides,
  };
}

let db: Kysely<DB>;
let sqlite: TestDb["sqlite"];

/** Provider names registered by a test — the registry is process-global. */
const registered: string[] = [];

/**
 * @param name - the provider instance name
 */
async function seedDescriptor(name: string,): Promise<void> {
  await setConfig(
    db,
    serverProviderDescriptorKey(name,),
    JSON.stringify(storedProvider({ name, label: name, },),),
  );
}

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

afterEach(async () => {
  for (const name of registered.splice(0,)) {
    unregisterProvider(name,);
  }

  await db.deleteFrom("system_config",).where("key", "like", "provider.%",).execute();
},);

afterAll(async () => {
  await initSmk({ required: false, compressThreshold: 1024, compressAlgorithm: "gzip", },);
  sqlite.close();
},);

describe("prepareProvider", () => {
  test("carries the stored descriptor into the instance config", () => {
    const prepared = prepareProvider(storedProvider(), "sk-value",);

    expect(prepared.instance.name,).toBe("acme",);
    expect(prepared.instance.baseUrl,).toBe("https://api.example.com/v1",);
    expect(prepared.instance.model,).toBe("demo-model",);
    expect(prepared.instance.apiKey,).toBe("sk-value",);
    expect(prepared.instance.allowedHosts,).toEqual(["api.example.com",],);
    expect(prepared.provider,).toBeDefined();
  });

  test("rejects a descriptor whose host is not approved", () => {
    expect(() => prepareProvider(storedProvider({ allowedHosts: [], },), undefined,)).toThrow(/not in allowlist/,);
  });
});

describe("probeProvider", () => {
  test("prepares the provider of an approved descriptor", () => {
    const result = probeProvider(storedProvider(), "sk-value",);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { throw new Error("expected the probe to succeed",); }

    expect(result.prepared.instance.name,).toBe("acme",);
  });

  test("reports the real reason a metadata target is rejected", () => {
    const result = probeProvider(
      storedProvider({
        baseUrl: "http://169.254.169.254/latest/meta-data/",
        allowedHosts: ["169.254.169.254",],
      },),
      undefined,
    );

    expect(result.ok,).toBe(false,);
    if (result.ok) { throw new Error("expected the probe to fail",); }

    expect(result.error,).toContain("link-local or cloud-metadata target",);
  });

  test("reports the real reason the provider construction fails", () => {
    const result = probeProvider(storedProvider({ allowedHosts: [], },), undefined,);
    expect(result.ok,).toBe(false,);
    if (result.ok) { throw new Error("expected the probe to fail",); }

    expect(result.error,).toContain("not in allowlist",);
  });
});

describe("activateProvider", () => {
  test("registers the provider and merges it into the live list", () => {
    const config = testConfig();
    activateProvider(config, "acme", prepareProvider(storedProvider(), undefined,),);
    registered.push("acme",);

    expect(getProvider("acme",),).toBeDefined();
    expect(config.generation.providers.openaiCompatible.map((instance,) => instance.name),).toEqual(["acme",],);
  });

  test("replaces an existing instance that carries the same name", () => {
    const config = testConfig();
    registered.push("acme",);
    activateProvider(config, "acme", prepareProvider(storedProvider({ label: "First", },), undefined,),);
    activateProvider(config, "acme", prepareProvider(storedProvider({ label: "Second", },), undefined,),);

    const instances = config.generation.providers.openaiCompatible;
    expect(instances,).toHaveLength(1,);
    expect(instances[0]?.label,).toBe("Second",);
  });
});

describe("removeServerProviderInstance", () => {
  test("prunes the instance and clears the default it held", () => {
    const config = testConfig();
    registered.push("acme",);
    activateProvider(config, "acme", prepareProvider(storedProvider(), undefined,),);
    config.generation.defaultProvider = "acme";
    config.generation.defaultModels = { acme: "demo-model", };

    removeServerProviderInstance(config, "acme",);

    expect(config.generation.providers.openaiCompatible,).toEqual([],);
    expect(config.generation.defaultProvider,).toBe("",);
    expect(config.generation.defaultModels,).toEqual({},);
  });

  test("leaves the default of another instance alone", () => {
    const config = testConfig();
    config.generation.defaultProvider = "other";
    config.generation.defaultModels = { other: "demo-model", };

    removeServerProviderInstance(config, "acme",);

    expect(config.generation.defaultProvider,).toBe("other",);
    expect(config.generation.defaultModels,).toEqual({ other: "demo-model", },);
  });
});

describe("readStoredProviders", () => {
  test("returns the stored descriptors ordered by name", async () => {
    await seedDescriptor("beta",);
    await seedDescriptor("alpha",);

    const providers = await readStoredProviders(db,);
    expect(providers.map((provider,) => provider.name),).toEqual(["alpha", "beta",],);
  });

  test("skips a malformed row", async () => {
    await setConfig(db, serverProviderDescriptorKey("broken",), "{not json",);

    expect(await readStoredProviders(db,),).toEqual([],);
  });

  test("skips a descriptor whose name does not match its key", async () => {
    await setConfig(
      db,
      serverProviderDescriptorKey("acme",),
      JSON.stringify(storedProvider({ name: "other", },),),
    );

    expect(await readStoredProviders(db,),).toEqual([],);
  });
});

describe("ServerProviderMaterializationError", () => {
  test("carries the operator-facing reason and is not a validation error", () => {
    const error = new ServerProviderMaterializationError("provider factory rejected the instance",);

    expect(error.name,).toBe("ServerProviderMaterializationError",);
    expect(error.message,).toBe("provider factory rejected the instance",);
    expect(error instanceof ServerProviderValidationError,).toBe(false,);
  });
});
