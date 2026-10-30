// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Routing facade: quota breach short-circuits BEFORE the provider call;
// a fresh quota lets the registry-owned provider serve and records usage.
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { loadConfig, } from "../config/load";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, destroyTestDb, } from "../test-utils/create-test-db";
import { MockLLMProvider, } from "../test-utils/mock-provider";
import { registerProvider, unregisterProvider, } from "./providers/registry";
import { QuotaEngine, QuotaExceededError, } from "./quota-engine";
import { callWithResource, resolveResource, } from "./resource-provider";

const PROVIDER = "rp-facade-mock";
const RESOURCE = "res-facade-1";

let testDb: Kysely<DB>;
let testSqlite: Database;
let config: Config;

beforeAll(async () => {
  try {
    createLogger({ level: "error", },);
  } catch { /* already initialized */ }

  const env = await createTestDb();
  testDb = env.db;
  testSqlite = env.sqlite;
  config = loadConfig();
  registerProvider(PROVIDER, new MockLLMProvider(),);
  await testDb
    .insertInto("resource_records",)
    .values({
      id: RESOURCE,
      owner_id: "user-1",
      type: "inference",
      provider: PROVIDER,
      endpoint: "http://localhost:8080/v1",
      credential_ref: "sha256:abc",
      quota: JSON.stringify({ requestsPerMinute: 1, },),
      status: "active",
    },)
    .execute();
},);

describe("resource-provider facade", () => {
  test("quota breach rejects without invoking the provider", async () => {
    // The quota object is pre-exhausted: if the guard leaked, resolveProvider
    // would route to the registered mock and return content instead of
    // throwing — so QuotaExceededError proves the breach fired BEFORE the call.
    const quota = new QuotaEngine();
    await quota.consumeRequest(RESOURCE, { requestsPerMinute: 1, },);
    let thrown: unknown;
    try {
      await callWithResource(RESOURCE, { model: "m", messages: [], params: {}, }, { db: testDb, config, quota, },);
    } catch (error) {
      thrown = error;
    }

    expect(thrown,).toBeInstanceOf(QuotaExceededError,);
    expect(quota.peek(RESOURCE,).requests,).toBe(1,);
  });

  test("fresh quota routes through the registry provider and records usage", async () => {
    const fresh = "res-facade-2";
    await testDb
      .insertInto("resource_records",)
      .values({
        id: fresh,
        owner_id: "user-1",
        type: "inference",
        provider: PROVIDER,
        endpoint: "http://localhost:8080/v1",
        credential_ref: "sha256:abc",
        quota: JSON.stringify({ requestsPerMinute: 5, },),
        status: "active",
      },)
      .execute();

    const quota = new QuotaEngine();
    const response = await callWithResource(
      fresh,
      { model: "m", messages: [], params: {}, },
      { db: testDb, config, quota, },
    );

    expect(response.content.length,).toBeGreaterThan(0,);
    expect(quota.peek(fresh,).requests,).toBe(1,);
    expect(quota.peek(fresh,).tokens,).toBe(30,);
  });

  test("resolveResource rejects unknown and non-active resources", async () => {
    await expect(resolveResource(testDb, "no-such-resource",),).rejects.toThrow("Unknown resource",);

    await testDb
      .insertInto("resource_records",)
      .values({
        id: "res-facade-paused",
        owner_id: "user-1",
        type: "inference",
        provider: PROVIDER,
        endpoint: "http://localhost:8080/v1",
        credential_ref: "sha256:abc",
        quota: JSON.stringify({ requestsPerMinute: 5, },),
        status: "paused",
      },)
      .execute();

    await expect(
      callWithResource("res-facade-paused", { model: "m", messages: [], params: {}, }, { db: testDb, config, },),
    ).rejects.toThrow("paused",);
  });
});

afterAll(async () => {
  unregisterProvider(PROVIDER,);
  // destroyTestDb drains the Kysely pool AND closes the sqlite handle.
  await destroyTestDb({ db: testDb, sqlite: testSqlite, },);
},);
