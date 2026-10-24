// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression tests: the BYO API key store accepts every provider the
 * registry can dispatch to — not only the openai-compatible ones.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { findProviderInstance, listProviderInstances, } from "../generation/providers/provider-instances";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUsers, } from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { apiKeysRoutes, } from "./api-keys";

/**
 * @returns a config with an openai-compatible, an anthropic and an ollama instance
 */
function testConfig(): Config {
  return {
    byoKey: { enabled: true, encryptionKey: "test-encryption-key-32-bytes!!", },
    generation: {
      providers: {
        openaiCompatible: [{ name: "test-prov", },],
        anthropic: { name: "anthropic", },
        ollamaNative: { name: "ollama-native", },
      },
    },
  } as unknown as Config;
}

/**
 * @param db
 * @param userId
 * @param cfg
 * @returns the mounted api-keys app
 */
function makeApp(db: Kysely<DB>, userId: string, cfg: Config,): Elysia {
  return new Elysia({ name: "test-api-keys-providers", },)
    .derive({ as: "scoped", }, () => ({ userId, userRole: "user", }),)
    .use(apiKeysRoutes({ database: db, config: cfg, },),) as unknown as Elysia;
}

/**
 * @param app
 * @param providerName
 * @returns the store response
 */
function storeKey(app: Elysia, providerName: string,): Promise<Response> {
  return app.handle(
    new Request("http://localhost/api/user-api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ name: providerName, provider: providerName, api_key: "sk-fixture-key-0123456789", },),
    },),
  );
}

describe("BYO key store provider validation", () => {
  let db: Kysely<DB>;
  const userId = uid();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await insertUsers(db, `user-${userId}`, "Key User", { id: userId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("a native anthropic provider name is accepted", async () => {
    const app = makeApp(db, userId, testConfig(),);

    const res = await storeKey(app, "anthropic",);

    expect(res.status,).toBe(200,);
    const stored: { ok: boolean; provider: string } = await res.json();
    expect(stored.ok,).toBe(true,);
    expect(stored.provider,).toBe("anthropic",);

    const rows = await db
      .selectFrom("user_api_keys",)
      .select("id",)
      .where("user_id", "=", userId,)
      .where("provider_name", "=", "anthropic",)
      .execute();

    expect(rows,).toHaveLength(1,);
  });

  test("a native ollama provider name is accepted", async () => {
    const app = makeApp(db, userId, testConfig(),);

    const res = await storeKey(app, "ollama-native",);

    expect(res.status,).toBe(200,);
    const stored: { ok: boolean; provider: string } = await res.json();
    expect(stored.provider,).toBe("ollama-native",);
  });

  test("an unknown provider is still rejected", async () => {
    const app = makeApp(db, userId, testConfig(),);

    const res = await storeKey(app, "ghost-prov",);

    expect(res.status,).toBe(400,);
  });

  test("a config without openai-compatible providers still resolves the native ones", async () => {
    const cfg = {
      byoKey: { enabled: true, encryptionKey: "test-encryption-key-32-bytes!!", },
      generation: {
        providers: {
          anthropic: { name: "anthropic", },
        },
      },
    } as unknown as Config;

    const app = makeApp(db, userId, cfg,);
    const res = await storeKey(app, "anthropic",);

    expect(res.status,).toBe(200,);
  });

  test("the shared instance list covers every registry-backed provider", () => {
    const names = listProviderInstances(testConfig(),).map((instance,) => instance.name);

    expect(names,).toContain("test-prov",);
    expect(names,).toContain("anthropic",);
    expect(names,).toContain("ollama-native",);
    expect(findProviderInstance(testConfig(), "anthropic",)?.allowUserApiKey,).toBe(true,);
    expect(findProviderInstance(testConfig(), "ghost-prov",),).toBeUndefined();
  });

  test("a provider that forbids user keys is reported as such", () => {
    const cfg = {
      byoKey: { enabled: true, encryptionKey: "test-encryption-key-32-bytes!!", },
      generation: {
        providers: {
          openaiCompatible: [{ name: "test-prov", },],
          anthropic: { name: "anthropic", allowUserApiKey: false, },
        },
      },
    } as unknown as Config;

    expect(findProviderInstance(cfg, "anthropic",)?.allowUserApiKey,).toBe(false,);
  });
});
