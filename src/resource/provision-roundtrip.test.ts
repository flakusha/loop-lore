// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Epic resource-provision round-trip: provision → call → quota enforcement →
// backup → tamper → drift → recover → rotation, through the real module APIs.
// Only the provider's complete fn and the browser backup store are faked.
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { loadConfig, } from "../config/load";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { registerProvider, unregisterProvider, } from "../generation/providers/registry";
import { QuotaEngine, QuotaExceededError, } from "../generation/quota-engine";
import { callWithResource, } from "../generation/resource-provider";
import { createLogger, } from "../logger";
import { createTestDb, destroyTestDb, } from "../test-utils/create-test-db";
import { MockLLMProvider, } from "../test-utils/mock-provider";
import {
  createBackup,
  exportBackup,
  importBackup,
  type KeyValueStore,
} from "./browser-backup";
import { addInferenceResource, revokeInferenceResource, testInferenceResource, } from "./external-inference";
import { HashMismatchError, verifyBackupIntegrity, writeBackup, } from "./external-storage";
import { reconcileRecord, } from "./reconciliation";
import { recoverRecord, rotateBackups, } from "./recovery";

const PROVIDER = "e2e-roundtrip-mock";
const RESOURCE = "e2e-inf-1";
const OWNER = "e2e-owner";

let testDb: Kysely<DB>;
let testSqlite: Database;
let config: Config;
let providerCalls = 0;

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string,) => data.get(key,) ?? null,
    setItem: (key: string, value: string,) => {
      data.set(key, value,);
    },
  };
}

beforeAll(async () => {
  try {
    createLogger({ level: "error", },);
  } catch { /* already initialized */ }

  const env = await createTestDb();
  testDb = env.db;
  testSqlite = env.sqlite;
  config = loadConfig();
  const mock = new MockLLMProvider();
  const origComplete = mock.complete.bind(mock,);
  mock.complete = async (req,) => {
    providerCalls += 1;
    return origComplete(req,);
  };

  registerProvider(PROVIDER, mock,);
},);

describe("provision round-trip", () => {
  test("provision → call → quota → backup → drift → recover → rotation", async () => {
    const added = await addInferenceResource(testDb, {
      id: RESOURCE,
      ownerId: OWNER,
      kind: "llm",
      provider: PROVIDER,
      endpoint: "http://localhost:8080/v1",
      secret: "sk-live-e2e-secret",
      quota: { requestsPerMinute: 2, },
    },);

    expect(added.status,).toBe("active",);

    const quota = new QuotaEngine();
    const req = { model: "m", messages: [], params: {}, };

    const first = await callWithResource(RESOURCE, req, { db: testDb, config, quota, },);
    expect(first.content.length,).toBeGreaterThan(0,);
    expect(providerCalls,).toBe(1,);
    expect(quota.peek(RESOURCE,).requests,).toBe(1,);
    expect(quota.peek(RESOURCE,).tokens,).toBe(30,);

    await callWithResource(RESOURCE, req, { db: testDb, config, quota, },);
    expect(providerCalls,).toBe(2,);
    await expect(callWithResource(RESOURCE, req, { db: testDb, config, quota, },),)
      .rejects.toBeInstanceOf(QuotaExceededError,);

    expect(providerCalls,).toBe(2,);
    expect(quota.peek(RESOURCE,).requests,).toBe(2,);

    const payload = JSON.stringify({ messages: [{ role: "user", text: "hello", },], },);
    const backup = await writeBackup(testDb, { ownerId: OWNER, resourceType: "chat", payload, },);
    const verified = await verifyBackupIntegrity(testDb, backup.id,);
    expect(verified.contentHash,).toBe(backup.contentHash,);

    await testDb
      .updateTable("backup_records",)
      .set({ payload: `X${payload.slice(1,)}`, },)
      .where("id", "=", backup.id,)
      .execute();

    await expect(verifyBackupIntegrity(testDb, backup.id,),)
      .rejects.toBeInstanceOf(HashMismatchError,);

    const store = memoryStore();
    const record = createBackup({
      ownerId: OWNER,
      resourceId: "chat-1",
      resourceType: "chat",
      data: { messages: ["hello",], },
    },);

    const key = await exportBackup(store, record,);
    const loaded = await importBackup(store, key,);
    expect(reconcileRecord(loaded, { serverHash: loaded.contentHash, serverVersion: 1, },),)
      .toBe("consistent",);

    const tampered = JSON.parse(store.data.get(key,)!,);
    tampered.payload = tampered.payload.length > 1 ? `X${tampered.payload.slice(1,)}` : "X";
    store.data.set(key, JSON.stringify(tampered,),);
    await expect(importBackup(store, key,),).rejects.toThrow(/integrity check/,);
    expect(reconcileRecord(tampered, { serverHash: record.contentHash, },),).toBe("drifted",);

    let applied: unknown = null;
    const recovered = await recoverRecord(
      record,
      {
        applyPayload: (_id: string, data: unknown,) => {
          applied = data;
        },
      },
      () => true,
    );

    expect(recovered.restored,).toBe(true,);
    expect(applied,).toEqual({ messages: ["hello",], },);

    const mk = (version: number,) =>
      createBackup({
        ownerId: OWNER,
        resourceId: "chat-1",
        resourceType: "chat",
        data: { v: version, },
        version,
        createdAt: `2026-10-${String(version,).padStart(2, "0",)}T00:00:00.000Z`,
      },);

    const kept = rotateBackups([mk(1,), mk(2,), mk(3,), mk(4,),], 2,);
    expect(kept.map((r,) => r.version).sort(),).toEqual([3, 4,],);

    await revokeInferenceResource(testDb, RESOURCE,);
    const callsBeforeRevoke = providerCalls;
    await expect(callWithResource(RESOURCE, req, { db: testDb, config, quota, },),)
      .rejects.toThrow("revoked",);

    expect(providerCalls,).toBe(callsBeforeRevoke,);
    const probe = await testInferenceResource(testDb, RESOURCE,);
    expect(probe.ok,).toBe(false,);
    if (!probe.ok) {
      expect(probe.reason,).toBe("revoked",);
      expect(probe.fallback,).toContain("fallback",);
    }
  });
});

afterAll(async () => {
  unregisterProvider(PROVIDER,);
  await destroyTestDb({ db: testDb, sqlite: testSqlite, },);
},);
