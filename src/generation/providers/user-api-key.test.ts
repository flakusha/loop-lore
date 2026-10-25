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
import type { Config, } from "../../config/schema";
import { encryptValue, } from "../../crypto";
import type { DB, } from "../../db/schema";
import { createTestDb, destroyTestDb, } from "../../test-utils/create-test-db";
import { ByoKeyDecryptError, userApiKeyResolver, } from "./user-api-key";

const SECRET = "uak-encryption-key";
const USER_ID = "uak-user";
const ALLOWED = "uak-allowed";
const BLOCKED = "uak-blocked";
const UNSTORED = "uak-unstored";

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

function config(): Config {
  const cfg: Config = {
    ...loadConfig(),
    generation: {
      providers: {
        openaiCompatible: [instance(ALLOWED, true,), instance(BLOCKED, false,),],
        anthropic: undefined,
        ollamaNative: undefined,
        sd: undefined,
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

  for (const provider of [ALLOWED, BLOCKED,]) {
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
});
