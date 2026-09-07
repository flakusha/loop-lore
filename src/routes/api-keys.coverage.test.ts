// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for BYO API key routes (list / store / delete).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUsers, } from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { apiKeysRoutes, } from "./api-keys";

/**
 * @param enabled
 * @param encryptionKey
 */
function testConfig(enabled = true, encryptionKey = "test-encryption-key-32-bytes!!",): Config {
  return {
    byoKey: { enabled, encryptionKey, },
    generation: { providers: { openaiCompatible: [{ name: "test-prov", },], }, },
  } as unknown as Config;
}

/**
 * @param db
 * @param userId
 * @param cfg
 */
function makeApp(db: Kysely<DB>, userId: string | null, cfg: Config,): Elysia {
  return new Elysia({ name: "test-api-keys-coverage", },)
    .derive({ as: "scoped", }, () => ({ userId, userRole: "user", }),)
    .use(apiKeysRoutes({ database: db, config: cfg, },),) as unknown as Elysia;
}

describe("apiKeysRoutes coverage", () => {
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

  test("401 for all endpoints without userId", async () => {
    const app = makeApp(db, null, testConfig(),);
    const list = await app.handle(new Request("http://localhost/api/user-api-keys",),);
    expect(list.status,).toBe(401,);
    const store = await app.handle(
      new Request("http://localhost/api/user-api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "test-prov", provider: "test-prov", api_key: "sk-x", },),
      },),
    );
    expect(store.status,).toBe(401,);
    const del = await app.handle(
      new Request("http://localhost/api/user-api-keys/test-prov", { method: "DELETE", },),
    );
    expect(del.status,).toBe(401,);
  });

  test("403 when the BYO feature is disabled", async () => {
    const app = makeApp(db, userId, testConfig(false,),);
    const list = await app.handle(new Request("http://localhost/api/user-api-keys",),);
    expect(list.status,).toBe(403,);
    const store = await app.handle(
      new Request("http://localhost/api/user-api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "test-prov", provider: "test-prov", api_key: "sk-x", },),
      },),
    );
    expect(store.status,).toBe(403,);
  });

  test("500 when no server encryption key is configured", async () => {
    const cfg = testConfig(true, "",);
    const app = makeApp(db, userId, cfg,);
    const res = await app.handle(
      new Request("http://localhost/api/user-api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "test-prov", provider: "test-prov", api_key: "sk-x", },),
      },),
    );
    expect(res.status,).toBe(500,);
  });

  test("400 for unknown providers", async () => {
    const app = makeApp(db, userId, testConfig(),);
    const res = await app.handle(
      new Request("http://localhost/api/user-api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "ghost-prov", provider: "ghost-prov", api_key: "sk-x", },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("store → list → upsert → delete lifecycle", async () => {
    const app = makeApp(db, userId, testConfig(),);
    const payload = { name: "test-prov", provider: "test-prov", api_key: "sk-first", };
    const store = await app.handle(
      new Request("http://localhost/api/user-api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify(payload,),
      },),
    );
    expect(store.status,).toBe(200,);
    const stored: { ok: boolean; provider: string } = await store.json();
    expect(stored.ok,).toBe(true,);
    expect(stored.provider,).toBe("test-prov",);

    const list = await app.handle(new Request("http://localhost/api/user-api-keys",),);
    expect(list.status,).toBe(200,);
    const keys: { provider_name: string }[] = await list.json();
    expect(keys.some((k,) => k.provider_name === "test-prov"),).toBe(true,);

    const upsert = await app.handle(
      new Request("http://localhost/api/user-api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ ...payload, api_key: "sk-second", },),
      },),
    );
    expect(upsert.status,).toBe(200,);
    const rows = await db
      .selectFrom("user_api_keys",)
      .select("id",)
      .where("user_id", "=", userId,)
      .where("provider_name", "=", "test-prov",)
      .execute();
    expect(rows,).toHaveLength(1,);

    const del = await app.handle(
      new Request("http://localhost/api/user-api-keys/test-prov", { method: "DELETE", },),
    );
    expect(del.status,).toBe(204,);
    const gone = await app.handle(
      new Request("http://localhost/api/user-api-keys/test-prov", { method: "DELETE", },),
    );
    expect(gone.status,).toBe(404,);
  });

  test("stored keys are scoped per user", async () => {
    const otherId = uid();
    await insertUsers(db, `user-${otherId}`, "Other", { id: otherId, } as never,);
    const mine = makeApp(db, userId, testConfig(),);
    await mine.handle(
      new Request("http://localhost/api/user-api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "test-prov", provider: "test-prov", api_key: "sk-mine", },),
      },),
    );
    const theirs = makeApp(db, otherId, testConfig(),);
    const list = await theirs.handle(new Request("http://localhost/api/user-api-keys",),);
    expect(list.status,).toBe(200,);
    const keys: { provider_name: string }[] = await list.json();
    expect(keys.some((k,) => k.provider_name === "test-prov"),).toBe(false,);
    const del = await theirs.handle(
      new Request("http://localhost/api/user-api-keys/test-prov", { method: "DELETE", },),
    );
    expect(del.status,).toBe(404,);
  });
});
