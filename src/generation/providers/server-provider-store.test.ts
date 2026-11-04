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
import { getProvider, unregisterProvider, } from "./registry";
import {
  applyStoredServerDefaults,
  deleteServerProvider,
  listServerProviders,
  materializeServerProviders,
  saveServerProvider,
  serverProviderDescriptorKey,
  serverProviderSecretKey,
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
    await setConfig(
      db,
      serverProviderDescriptorKey("boot-provider",),
      JSON.stringify({
        name: "boot-provider",
        label: "Boot Provider",
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
    registered.push("boot-provider",);

    expect(materialized,).toContain("boot-provider",);
    expect(getProvider("boot-provider",),).toBeDefined();
    expect(config.generation.providers.openaiCompatible.map((p,) => p.name),).toContain("boot-provider",);
  });

  test("makes a lone materialized provider the default", async () => {
    const config = testConfig();
    await setConfig(
      db,
      serverProviderDescriptorKey("lone-provider",),
      JSON.stringify({
        name: "lone-provider",
        label: "Lone Provider",
        baseUrl: "https://api.example.com/v1",
        model: "demo-model",
        allowedHosts: ["api.example.com",],
        timeout: 30_000,
        retries: 3,
        allowUserApiKey: true,
        setDefault: false,
      },),
    );

    await materializeServerProviders(db, config,);
    registered.push("lone-provider",);

    expect(config.generation.defaultProvider,).toBe("lone-provider",);
    expect(config.generation.defaultModels["lone-provider"],).toBe("demo-model",);
  });

  test("skips a descriptor whose remote host is not approved", async () => {
    const config = testConfig();
    await setConfig(
      db,
      serverProviderDescriptorKey("unapproved-provider",),
      JSON.stringify({
        name: "unapproved-provider",
        label: "Unapproved Provider",
        baseUrl: "https://api.example.com/v1",
        model: "demo-model",
        allowedHosts: [],
        timeout: 30_000,
        retries: 3,
        allowUserApiKey: true,
        setDefault: false,
      },),
    );

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
    await setConfig(
      db,
      serverProviderDescriptorKey("defaulted-provider",),
      JSON.stringify({
        name: "defaulted-provider",
        label: "Defaulted Provider",
        baseUrl: "https://api.example.com/v1",
        model: "demo-model",
        allowedHosts: ["api.example.com",],
        timeout: 30_000,
        retries: 3,
        allowUserApiKey: true,
        setDefault: false,
      },),
    );

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

    await deleteServerProvider(db, "deleted-default",);

    expect(await getConfigValue(db, "default_provider",),).toBeUndefined();
    expect(getProvider("deleted-default",),).toBeUndefined();
  });
});
