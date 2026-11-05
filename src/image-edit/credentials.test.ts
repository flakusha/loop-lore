// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Image-edit BYOK credential resolution (resolveEditApiKey).
 *
 * The edit path resolves the user's stored key for the edit-purpose sd
 * provider instance: stored + allowed → user key, no row → undefined (the
 * provider keeps its operator key), explicitly denied → undefined, and a
 * corrupt row FAILS CLOSED via ByoKeyDecryptError — never the operator key.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { loadConfig, } from "../config/load";
import type { Config, ImageProviderConfig, } from "../config/schema";
import { encryptValue, } from "../crypto";
import type { DB, } from "../db/schema";
import { ByoKeyDecryptError, } from "../generation/providers/user-api-key";
import { createTestDb, destroyTestDb, } from "../test-utils/create-test-db";
import { insertUserApiKeys, insertUsers, } from "../test-utils/insert-helpers";
import { resolveEditApiKey, } from "./credentials";

const SECRET = "edit-byok-encryption-key";
const USER_ID = "edit-byok-user";

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

/** Config whose edit-purpose head is the named provider. */
function config(providerName: string, allowUserApiKey?: boolean,): Config {
  const cfg: Config = {
    ...loadConfig(),
    generation: {
      providers: {
        openaiCompatible: [],
        anthropic: undefined,
        ollamaNative: undefined,
        sd: [sdInstance(providerName, allowUserApiKey,),],
      },
      defaultProvider: "",
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
  await insertUsers(testDb, USER_ID, "Edit BYOK User", { id: USER_ID, },);
},);

afterAll(async () => {
  await destroyTestDb({ db: testDb, sqlite: testSqlite, },);
},);

describe("resolveEditApiKey", () => {
  test("returns the user's stored key for the edit-purpose provider", async () => {
    const providerName = "edit-stored";
    await insertUserApiKeys(
      testDb,
      USER_ID,
      providerName,
      await encryptValue("sk-user-edit-key", SECRET,),
    );

    const key = await resolveEditApiKey({
      userId: USER_ID,
      config: config(providerName,),
      db: testDb,
    },);

    expect(key,).toBe("sk-user-edit-key",);
  });

  test("no stored row falls back to the operator key posture (undefined)", async () => {
    const key = await resolveEditApiKey({
      userId: USER_ID,
      config: config("edit-absent",),
      db: testDb,
    },);

    expect(key,).toBeUndefined();
  });

  test("an explicitly denied provider never sees the stored key", async () => {
    const providerName = "edit-denied";
    await insertUserApiKeys(
      testDb,
      USER_ID,
      providerName,
      await encryptValue("sk-denied", SECRET,),
    );

    const key = await resolveEditApiKey({
      userId: USER_ID,
      config: config(providerName, false,),
      db: testDb,
    },);

    expect(key,).toBeUndefined();
  });

  test("a corrupt stored ciphertext fails closed — ByoKeyDecryptError, not the operator key", async () => {
    const providerName = "edit-corrupt";
    await insertUserApiKeys(testDb, USER_ID, providerName, "definitely-not-valid-ciphertext",);

    const resolve = resolveEditApiKey({
      userId: USER_ID,
      config: config(providerName,),
      db: testDb,
    },);

    await expect(resolve,).rejects.toThrow(ByoKeyDecryptError,);
  });

  test("no configured edit provider resolves nothing", async () => {
    const cfg = config("edit-irrelevant",);
    cfg.generation.providers.sd = [];

    const key = await resolveEditApiKey({ userId: USER_ID, config: cfg, db: testDb, },);
    expect(key,).toBeUndefined();
  });
});
