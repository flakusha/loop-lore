// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the server provider store — sealed key storage, descriptor
 * listing, registry materialization and the stored default read-back.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { getConfigValue, setConfig, } from "../../admin/config";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import { initSmk, } from "../../crypto/smk";
import type { DB, } from "../../db/schema";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { circuitBreaker, } from "./circuit-breaker";
import { getProvider, unregisterProvider, } from "./registry";
import {
  applyStoredServerDefaults,
  deleteServerProvider,
  listServerProviders,
  materializeServerProviders,
  saveServerProvider,
  serverProviderDescriptorKey,
  serverProviderSecretKey,
  ServerProviderValidationError,
} from "./server-provider-store";

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
 * Seed a stored descriptor together with its sealed key.
 * @param name - the provider instance name
 * @param overrides - descriptor fields to override
 */
async function seedDescriptor(name: string, overrides: Record<string, unknown> = {},): Promise<void> {
  await setConfig(
    db,
    serverProviderDescriptorKey(name,),
    JSON.stringify({
      name,
      label: name,
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
      allowedHosts: ["api.example.com",],
      timeout: 30_000,
      retries: 3,
      allowUserApiKey: true,
      setDefault: false,
      ...overrides,
    },),
  );

  await setConfig(db, serverProviderSecretKey(name,), "sk-seeded-value",);
}

let db: Kysely<DB>;
let sqlite: TestDb["sqlite"];

/** Provider names registered by a test — the registry is process-global. */
const registered: string[] = [];

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

  // The suite shares one database — clear the provider rows so each test
  // starts from the fresh-install state.
  await db.deleteFrom("system_config",).where("key", "like", "provider.%",).execute();
  await db.deleteFrom("system_config",).where("key", "=", "default_provider",).execute();
  await db.deleteFrom("system_config",).where("key", "=", "default_model",).execute();
},);

afterAll(async () => {
  await initSmk({ required: false, compressThreshold: 1024, compressAlgorithm: "gzip", },);
  sqlite.close();
},);

describe("server provider store", () => {
  test("stores the API key sealed and never in plaintext", async () => {
    const config = testConfig();
    await saveServerProvider(db, {
      name: "sealed-provider",
      label: "Sealed Provider",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
      apiKey: "sk-plaintext-value",
      config,
    },);

    registered.push("sealed-provider",);

    const row = await db
      .selectFrom("system_config",)
      .select("value",)
      .where("key", "=", serverProviderSecretKey("sealed-provider",),)
      .executeTakeFirst();

    expect(row?.value,).toStartWith("secret:v1:",);
    expect(row?.value,).not.toContain("sk-plaintext-value",);
    expect(await getConfigValue(db, serverProviderSecretKey("sealed-provider",),),).toBe("sk-plaintext-value",);
  });

  test("lists descriptors without exposing the key", async () => {
    const config = testConfig();
    await saveServerProvider(db, {
      name: "listed-provider",
      label: "Listed Provider",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
      apiKey: "sk-listed-value",
      config,
    },);

    registered.push("listed-provider",);

    const providers = await listServerProviders(db,);
    const descriptor = providers.find((provider,) => provider.name === "listed-provider");

    expect(descriptor?.hasApiKey,).toBe(true,);
    expect(descriptor?.baseUrl,).toBe("https://api.example.com/v1",);
    expect(descriptor?.allowedHosts,).toEqual(["api.example.com",],);
    expect(JSON.stringify(providers,),).not.toContain("sk-listed-value",);
  });

  test("keeps the stored key when an update omits apiKey", async () => {
    const config = testConfig();
    await saveServerProvider(db, {
      name: "kept-key-provider",
      label: "Kept Key Provider",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
      apiKey: "sk-original-value",
      config,
    },);

    registered.push("kept-key-provider",);

    await saveServerProvider(db, {
      name: "kept-key-provider",
      label: "Kept Key Provider",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model-2",
      config,
    },);

    expect(await getConfigValue(db, serverProviderSecretKey("kept-key-provider",),),).toBe("sk-original-value",);
  });

  test("materializes the provider into the registry", async () => {
    const config = testConfig();
    await seedDescriptor("boot-provider",);

    const materialized = await materializeServerProviders(db, config,);
    registered.push("boot-provider",);

    expect(materialized,).toContain("boot-provider",);
    expect(getProvider("boot-provider",),).toBeDefined();
    expect(config.generation.providers.openaiCompatible.map((p,) => p.name),).toContain("boot-provider",);
  });

  test("makes a lone materialized provider the default", async () => {
    const config = testConfig();
    await seedDescriptor("lone-provider",);

    await materializeServerProviders(db, config,);
    registered.push("lone-provider",);

    expect(config.generation.defaultProvider,).toBe("lone-provider",);
    expect(config.generation.defaultModels["lone-provider"],).toBe("demo-model",);
  });

  test("skips a descriptor whose remote host is not approved", async () => {
    const config = testConfig();
    await seedDescriptor("unapproved-provider", { allowedHosts: [], },);

    const materialized = await materializeServerProviders(db, config,);

    expect(materialized,).not.toContain("unapproved-provider",);
    expect(getProvider("unapproved-provider",),).toBeUndefined();
  });

  test("skips a malformed descriptor row instead of throwing", async () => {
    await setConfig(db, serverProviderDescriptorKey("broken-provider",), "{not json",);

    const providers = await listServerProviders(db,);
    expect(providers.some((provider,) => provider.name === "broken-provider"),).toBe(false,);
  });

  test("skips a descriptor whose name does not match its own key", async () => {
    await setConfig(
      db,
      serverProviderDescriptorKey("mismatched",),
      JSON.stringify({
        name: "other-name",
        label: "Mismatched",
        baseUrl: "https://api.example.com/v1",
        model: "demo-model",
        allowedHosts: ["api.example.com",],
        timeout: 30_000,
        retries: 3,
        allowUserApiKey: true,
        setDefault: false,
      },),
    );

    const providers = await listServerProviders(db,);
    expect(providers.some((provider,) => provider.name === "other-name"),).toBe(false,);
    expect(providers.some((provider,) => provider.name === "mismatched"),).toBe(false,);
  });

  test("applies the stored default_provider read-back on materialize", async () => {
    const config = testConfig();
    await seedDescriptor("defaulted-provider",);

    await setConfig(db, "default_provider", "defaulted-provider",);
    await setConfig(db, "default_model", "demo-model",);

    await materializeServerProviders(db, config,);
    registered.push("defaulted-provider",);

    expect(config.generation.defaultProvider,).toBe("defaulted-provider",);
    expect(config.generation.defaultModels["defaulted-provider"],).toBe("demo-model",);
  });

  test("applies the stored defaults only for a materialized provider", async () => {
    const config = testConfig();
    await setConfig(db, "default_provider", "not-registered",);

    await applyStoredServerDefaults(db, config,);

    expect(config.generation.defaultProvider,).toBe("",);
  });

  test("an update replaces the live registry instance and the stored key", async () => {
    const config = testConfig();
    await saveServerProvider(db, {
      name: "updated-provider",
      label: "Updated Provider",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
      apiKey: "sk-first-value",
      config,
    },);

    registered.push("updated-provider",);
    const first = getProvider("updated-provider",);

    await saveServerProvider(db, {
      name: "updated-provider",
      label: "Updated Provider",
      baseUrl: "https://api.example.com/v2",
      model: "demo-model-2",
      apiKey: "sk-second-value",
      config,
    },);

    // The registry keeps the FIRST instance for a name — the update must swap it.
    const second = getProvider("updated-provider",);
    expect(second,).toBeDefined();
    expect(second,).not.toBe(first,);
    expect(config.generation.providers.openaiCompatible[0]?.baseUrl,).toBe("https://api.example.com/v2",);
    expect(await getConfigValue(db, serverProviderSecretKey("updated-provider",),),).toBe("sk-second-value",);
  });

  test("makes the first saved provider the default", async () => {
    const config = testConfig();
    await saveServerProvider(db, {
      name: "first-provider",
      label: "First Provider",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
      apiKey: "sk-first-value",
      config,
    },);

    registered.push("first-provider",);

    expect(config.generation.defaultProvider,).toBe("first-provider",);
    expect(config.generation.defaultModels["first-provider"],).toBe("demo-model",);
    expect(await getConfigValue(db, "default_provider",),).toBe("first-provider",);
  });

  test("clears the stored default when the default provider is deleted", async () => {
    const config = testConfig();
    await saveServerProvider(db, {
      name: "deleted-default",
      label: "Deleted Default",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
      apiKey: "sk-delete-value",
      config,
    },);

    registered.push("deleted-default",);

    expect(await getConfigValue(db, "default_provider",),).toBe("deleted-default",);

    await deleteServerProvider(db, { name: "deleted-default", config, },);

    expect(await getConfigValue(db, "default_provider",),).toBeUndefined();
    expect(getProvider("deleted-default",),).toBeUndefined();
  });

  test("rejects a name another provider already owns", async () => {
    const config = testConfig();
    config.generation.providers.openaiCompatible = [{
      name: "taken-provider",
      label: "Taken Provider",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
      timeout: 30_000,
      retries: 3,
      allowUserApiKey: true,
      models: {},
    },];

    await expect(saveServerProvider(db, {
      name: "taken-provider",
      label: "Taken Provider",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
      apiKey: "sk-taken-value",
      config,
    },),).rejects.toThrow(ServerProviderValidationError,);

    expect(getProvider("taken-provider",),).toBeUndefined();
    expect(await getConfigValue(db, serverProviderDescriptorKey("taken-provider",),),).toBeUndefined();
  });

  test("keeps the stored default intent and refreshes the persisted default rows on update", async () => {
    const config = testConfig();
    await saveServerProvider(db, {
      name: "intent-provider",
      label: "Intent Provider",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
      apiKey: "sk-intent-value",
      setDefault: true,
      config,
    },);

    registered.push("intent-provider",);

    expect(config.generation.defaultProvider,).toBe("intent-provider",);

    // An update without setDefault keeps the stored intent …
    await saveServerProvider(db, {
      name: "intent-provider",
      label: "Intent Provider",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model-2",
      config,
    },);

    expect(config.generation.defaultProvider,).toBe("intent-provider",);
    // … and the persisted default rows are refreshed with the new model, so
    // the live default and the stored default do not drift apart.
    expect(await getConfigValue(db, "default_provider",),).toBe("intent-provider",);
    expect(await getConfigValue(db, "default_model",),).toBe("demo-model-2",);
    expect(config.generation.defaultModels["intent-provider"],).toBe("demo-model-2",);
  });

  test("writes the descriptor and the key in one transaction", async () => {
    const config = testConfig();

    // Without key material the sealed key row cannot be written — the whole
    // transaction must roll back, so neither row survives.
    await initSmk({ required: false, compressThreshold: 1024, compressAlgorithm: "gzip", },);
    try {
      await expect(saveServerProvider(db, {
        name: "atomic-provider",
        label: "Atomic Provider",
        baseUrl: "https://api.example.com/v1",
        model: "demo-model",
        apiKey: "sk-atomic-value",
        config,
      },),).rejects.toThrow();
    } finally {
      await initSmk({
        serverEncryptionKey: "f".repeat(64,),
        required: false,
        compressThreshold: 1024,
        compressAlgorithm: "gzip",
      },);
    }

    const descriptor = await db
      .selectFrom("system_config",)
      .select("value",)
      .where("key", "=", serverProviderDescriptorKey("atomic-provider",),)
      .executeTakeFirst();

    const secret = await db
      .selectFrom("system_config",)
      .select("value",)
      .where("key", "=", serverProviderSecretKey("atomic-provider",),)
      .executeTakeFirst();

    expect(descriptor,).toBeUndefined();
    expect(secret,).toBeUndefined();
    expect(getProvider("atomic-provider",),).toBeUndefined();
  });

  test("does not materialize a descriptor that has no stored key", async () => {
    const config = testConfig();
    await setConfig(
      db,
      serverProviderDescriptorKey("keyless-provider",),
      JSON.stringify({
        name: "keyless-provider",
        label: "Keyless Provider",
        baseUrl: "https://api.example.com/v1",
        model: "demo-model",
        allowedHosts: ["api.example.com",],
        timeout: 30_000,
        retries: 3,
        allowUserApiKey: true,
        setDefault: false,
      },),
    );

    const materialized = await materializeServerProviders(db, config,);

    expect(materialized,).not.toContain("keyless-provider",);
    expect(getProvider("keyless-provider",),).toBeUndefined();
  });

  test("does not materialize a stored descriptor that points at a metadata target", async () => {
    const config = testConfig();
    // Injected through the generic system-config path — it never passes the
    // store's validation, so the boot path has to re-check it.
    await seedDescriptor("metadata-provider", {
      baseUrl: "http://169.254.169.254/v1",
      allowedHosts: ["169.254.169.254",],
    },);

    const materialized = await materializeServerProviders(db, config,);

    expect(materialized,).not.toContain("metadata-provider",);
    expect(getProvider("metadata-provider",),).toBeUndefined();
  });

  test("rejects a metadata target host on save", async () => {
    const config = testConfig();

    await expect(saveServerProvider(db, {
      name: "metadata-save-provider",
      label: "Metadata Save Provider",
      baseUrl: "http://169.254.169.254/v1",
      model: "demo-model",
      config,
    },),).rejects.toThrow(ServerProviderValidationError,);

    expect(getProvider("metadata-save-provider",),).toBeUndefined();
  });

  test("keeps loopback providers allowed", async () => {
    const config = testConfig();
    await saveServerProvider(db, {
      name: "local-provider",
      label: "Local Provider",
      baseUrl: "http://localhost:11434/v1",
      model: "demo-model",
      config,
    },);

    registered.push("local-provider",);

    expect(getProvider("local-provider",),).toBeDefined();
  });

  test("rejects an allowed host that is not a bare hostname", async () => {
    const config = testConfig();
    const rejected = [
      "*",
      "*.com",
      "https://api.example.com",
      "api.example.com/v1",
      "api.example.com:443",
      "user@api.example.com",
    ];

    for (const allowedHost of rejected) {
      await expect(saveServerProvider(db, {
        name: `bad-host-${allowedHost.length}-${allowedHost.charCodeAt(0,)}`,
        label: "Bad Host Provider",
        baseUrl: "https://api.example.com/v1",
        model: "demo-model",
        allowedHosts: [allowedHost,],
        config,
      },),).rejects.toThrow(ServerProviderValidationError,);
    }

    expect(await getConfigValue(db, serverProviderDescriptorKey("bad-host-1-42",),),).toBeUndefined();
  });

  test("delete removes the config-file instance and the registry entry", async () => {
    const config = testConfig();
    await saveServerProvider(db, {
      name: "pruned-provider",
      label: "Pruned Provider",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
      apiKey: "sk-pruned-value",
      config,
    },);

    registered.push("pruned-provider",);

    expect(config.generation.providers.openaiCompatible.map((entry,) => entry.name),).toContain("pruned-provider",);

    await deleteServerProvider(db, { name: "pruned-provider", config, },);

    expect(getProvider("pruned-provider",),).toBeUndefined();
    expect(config.generation.providers.openaiCompatible.map((entry,) => entry.name),).not.toContain("pruned-provider",);
  });

  test("a successful update resets the circuit breaker of the provider", async () => {
    const config = testConfig();
    await saveServerProvider(db, {
      name: "tripped-provider",
      label: "Tripped Provider",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
      apiKey: "sk-tripped-value",
      config,
    },);

    registered.push("tripped-provider",);

    circuitBreaker.onFailure("tripped-provider",);
    circuitBreaker.onFailure("tripped-provider",);
    circuitBreaker.onFailure("tripped-provider",);
    expect(circuitBreaker.getState("tripped-provider",)?.state,).toBe("open",);

    await saveServerProvider(db, {
      name: "tripped-provider",
      label: "Tripped Provider",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
      apiKey: "sk-tripped-value",
      config,
    },);

    expect(circuitBreaker.getState("tripped-provider",)?.state,).toBe("closed",);
  });

  test("an explicit empty apiKey clears the stored key", async () => {
    const config = testConfig();
    await saveServerProvider(db, {
      name: "cleared-key-provider",
      label: "Cleared Key Provider",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
      apiKey: "sk-to-clear",
      config,
    },);

    registered.push("cleared-key-provider",);

    await saveServerProvider(db, {
      name: "cleared-key-provider",
      label: "Cleared Key Provider",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
      apiKey: "",
      config,
    },);

    expect(await getConfigValue(db, serverProviderSecretKey("cleared-key-provider",),),).toBe("",);
    const descriptor = await listServerProviders(db,);
    expect(descriptor.find((entry,) => entry.name === "cleared-key-provider")?.hasApiKey,).toBe(false,);
  });

  test("records the mutation in the audit trail", async () => {
    const config = testConfig();
    await saveServerProvider(db, {
      name: "audited-provider",
      label: "Audited Provider",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
      apiKey: "sk-audited-value",
      actor: "admin-user-1",
      config,
    },);

    registered.push("audited-provider",);

    const rows = await db
      .selectFrom("log_entries",)
      .select(["action", "user_id", "entity_id", "meta",],)
      .where("action", "=", "server-provider.saved",)
      .where("entity_id", "=", "audited-provider",)
      .execute();

    expect(rows.length,).toBe(1,);
    expect(rows[0]?.user_id,).toBe("admin-user-1",);
    expect(rows[0]?.entity_id,).toBe("audited-provider",);
    expect(rows[0]?.meta,).not.toContain("sk-audited-value",);
  });

  test("lists a stored provider that is not live with its reason", async () => {
    await seedDescriptor("inactive-provider", { allowedHosts: [], },);

    const providers = await listServerProviders(db,);
    const descriptor = providers.find((entry,) => entry.name === "inactive-provider");

    expect(descriptor?.state,).toBe("error",);
    expect(descriptor?.error,).toBeTruthy();
  });

  test("lists the real reason a stored provider is not live", async () => {
    // A descriptor without a key row is skipped at boot - the listing must
    // carry that reason, not a proxy message.
    await seedDescriptor("keyless-provider",);
    await db
      .deleteFrom("system_config",)
      .where("key", "=", serverProviderSecretKey("keyless-provider",),)
      .execute();

    const providers = await listServerProviders(db,);
    const descriptor = providers.find((entry,) => entry.name === "keyless-provider");

    expect(descriptor?.state,).toBe("error",);
    expect(descriptor?.error,).toBe("The descriptor has no stored API key.",);
  });
});
