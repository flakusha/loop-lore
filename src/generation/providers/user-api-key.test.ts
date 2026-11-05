// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-provider BYO key resolution (userApiKeyResolver).
 *
 * The resolver is the single gate on the user_api_keys table: it must hand
 * back a key only for the provider it was stored against, only when BYO is
 * enabled, and only when that provider accepts user keys.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { loadConfig, } from "../../config/load";
import type { Config, ImageProviderConfig, } from "../../config/schema";
import { encryptValue, } from "../../crypto";
import type { DB, } from "../../db/schema";
import { createTestDb, destroyTestDb, } from "../../test-utils/create-test-db";
import { ByoKeyDecryptError, userApiKeyResolver, } from "./user-api-key";

const SECRET = "uak-encryption-key";
const USER_ID = "uak-user";
const ALLOWED = "uak-allowed";
const BLOCKED = "uak-blocked";
const UNSTORED = "uak-unstored";
// Image providers (generation.providers.sd) — the BYOK image coverage.
const SD_ALLOWED = "sd-remote";
const SD_BLOCKED = "sd-pinned";
const SD_ABSENT = "sd-unstored";

function instance(name: string, allowUserApiKey: boolean,) {
  return {
    name,
    label: name,
    baseUrl: `http://${name}.invalid/v1`,
    model: "m",
    timeout: 1000,
    retries: 0,
    allowUserApiKey,
    models: {},
  };
}

function sdInstance(name: string, allowUserApiKey?: boolean,): ImageProviderConfig {
  return {
    name,
    label: name,
    baseUrl: `http://${name}.invalid`,
    apiFamily: "openai",
    ...(allowUserApiKey === undefined ? {} : { allowUserApiKey, }),
    defaults: { width: 64, height: 64, steps: 1, cfgScale: 1, sampler: "euler", },
    timeout: 1000,
    generationTimeout: 1000,
  };
}

function config(): Config {
  const cfg: Config = {
    ...loadConfig(),
    generation: {
      providers: {
        openaiCompatible: [instance(ALLOWED, true,), instance(BLOCKED, false,),],
        anthropic: undefined,
        ollamaNative: undefined,
        sd: [sdInstance(SD_ALLOWED,), sdInstance(SD_BLOCKED, false,),],
      },
      defaultProvider: ALLOWED,
      defaultModels: {},
    },
  };

  cfg.byoKey = { enabled: true, encryptionKey: SECRET, } as Config["byoKey"];
  return cfg;
}

let testDb: Kysely<DB>;
let testSqlite: Database;

beforeAll(async () => {
  const env = await createTestDb();
  testDb = env.db;
  testSqlite = env.sqlite;
  await testDb.insertInto("users",).values({
    id: USER_ID,
    username: USER_ID,
    display_name: "BYO User",
    role: "user",
    status: "active",
    settings: "{}",
  },).execute();

  for (const provider of [ALLOWED, BLOCKED, SD_ALLOWED,]) {
    await testDb.insertInto("user_api_keys",).values({
      id: crypto.randomUUID(),
      user_id: USER_ID,
      provider_name: provider,
      api_key_encrypted: await encryptValue(`sk-${provider}`, SECRET,),
    },).execute();
  }
},);

afterAll(async () => {
  await destroyTestDb({ db: testDb, sqlite: testSqlite, },);
},);

describe("userApiKeyResolver", () => {
  test("returns the stored key for the provider it was stored against", async () => {
    const resolve = userApiKeyResolver({ userId: USER_ID, config: config(), db: testDb, },);
    expect(await resolve(ALLOWED,),).toBe(`sk-${ALLOWED}`,);
  });

  test("returns undefined for a provider with no stored key", async () => {
    const resolve = userApiKeyResolver({ userId: USER_ID, config: config(), db: testDb, },);
    expect(await resolve(UNSTORED,),).toBeUndefined();
  });

  test("returns undefined when the provider sets allowUserApiKey: false", async () => {
    const resolve = userApiKeyResolver({ userId: USER_ID, config: config(), db: testDb, },);
    expect(await resolve(BLOCKED,),).toBeUndefined();
  });

  test("returns undefined without a user id, or when BYO is off", async () => {
    const cfg = config();
    expect(await userApiKeyResolver({ config: cfg, db: testDb, },)(ALLOWED,),).toBeUndefined();

    const disabled = config();
    disabled.byoKey = { enabled: false, encryptionKey: SECRET, } as Config["byoKey"];
    expect(await userApiKeyResolver({ userId: USER_ID, config: disabled, db: testDb, },)(ALLOWED,),).toBeUndefined();
  });

  test("returns undefined when the encryption key is missing", async () => {
    const cfg = config();
    cfg.byoKey = { enabled: true, encryptionKey: "", } as Config["byoKey"];
    expect(await userApiKeyResolver({ userId: USER_ID, config: cfg, db: testDb, },)(ALLOWED,),).toBeUndefined();
  });

  test("throws ByoKeyDecryptError when decryption fails — never silently bills the server key", async () => {
    await testDb.insertInto("user_api_keys",).values({
      id: crypto.randomUUID(),
      user_id: USER_ID,
      provider_name: UNSTORED,
      api_key_encrypted: "not-valid-ciphertext",
    },).execute();

    const resolve = userApiKeyResolver({ userId: USER_ID, config: config(), db: testDb, },);
    await expect(resolve(UNSTORED,),).rejects.toThrow(ByoKeyDecryptError,);
  });

  test("ByoKeyDecryptError names the provider, never key material", async () => {
    const resolve = userApiKeyResolver({ userId: USER_ID, config: config(), db: testDb, },);
    const err = await resolve(UNSTORED,).catch((e: unknown,) => e);
    expect(err,).toBeInstanceOf(ByoKeyDecryptError,);
    expect((err as Error).message,).toContain(UNSTORED,);
    expect((err as Error).message,).not.toContain("sk-",);
  });

  // ── Image providers (generation.providers.sd) — BYOK image coverage ──

  test("resolves a stored key for an image provider", async () => {
    const resolve = userApiKeyResolver({ userId: USER_ID, config: config(), db: testDb, },);
    expect(await resolve(SD_ALLOWED,),).toBe(`sk-${SD_ALLOWED}`,);
  });

  test("an image provider without the flag defaults to user-key-allowed", async () => {
    // sdInstance(SD_ALLOWED,) omits allowUserApiKey — the historical
    // default-allow must hold for image providers too.
    const resolve = userApiKeyResolver({ userId: USER_ID, config: config(), db: testDb, },);
    expect(await resolve(SD_ALLOWED,),).toBeDefined();
  });

  test("returns undefined for an image provider with allowUserApiKey: false", async () => {
    const resolve = userApiKeyResolver({ userId: USER_ID, config: config(), db: testDb, },);
    expect(await resolve(SD_BLOCKED,),).toBeUndefined();
  });

  test("returns undefined for an image provider with no stored key — operator key path", async () => {
    const resolve = userApiKeyResolver({ userId: USER_ID, config: config(), db: testDb, },);
    expect(await resolve(SD_ABSENT,),).toBeUndefined();
  });

  test("a corrupt IMAGE-provider key fails closed — never the operator key", async () => {
    await testDb.insertInto("user_api_keys",).values({
      id: crypto.randomUUID(),
      user_id: USER_ID,
      provider_name: SD_ABSENT,
      api_key_encrypted: "corrupt-image-key-ciphertext",
    },).execute();

    const resolve = userApiKeyResolver({ userId: USER_ID, config: config(), db: testDb, },);
    await expect(resolve(SD_ABSENT,),).rejects.toThrow(ByoKeyDecryptError,);
  });
});
