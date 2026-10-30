// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Provisioned inference: credential never persists raw; add→list→revoke
// round-trips; paused/revoked/exhausted reject with structured fallback.
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { QuotaEngine, } from "../generation/quota-engine";
import { createLogger, } from "../logger";
import { createTestDb, destroyTestDb, } from "../test-utils/create-test-db";
import {
  addInferenceResource,
  checkInferenceAvailable,
  listInferenceResources,
  ResourceUnavailableError,
  revokeInferenceResource,
  testInferenceResource,
} from "./external-inference";

const SECRET = "sk-live-test-inference-secret";

let testDb: Kysely<DB>;
let testSqlite: Database;

beforeAll(async () => {
  try {
    createLogger({ level: "error", },);
  } catch { /* already initialized */ }

  const env = await createTestDb();
  testDb = env.db;
  testSqlite = env.sqlite;
},);

describe("external-inference", () => {
  test("add→list→revoke round-trips without persisting the raw secret", async () => {
    const added = await addInferenceResource(testDb, {
      id: "inf-roundtrip-1",
      ownerId: "user-1",
      kind: "llm",
      provider: "openai",
      endpoint: "https://api.example.com/v1",
      secret: SECRET,
    },);

    expect(Object.keys(added,),).not.toContain("credentialRef",);

    const row = await testDb
      .selectFrom("resource_records",)
      .select(["credential_ref",],)
      .where("id", "=", "inf-roundtrip-1",)
      .executeTakeFirstOrThrow();

    expect(row.credential_ref,).not.toContain(SECRET,);

    const listed = await listInferenceResources(testDb, "user-1",);
    expect(listed.some((r,) => r.id === "inf-roundtrip-1"),).toBe(true,);

    await revokeInferenceResource(testDb, "inf-roundtrip-1",);
    const probe = await testInferenceResource(testDb, "inf-roundtrip-1",);
    expect(probe.ok,).toBe(false,);
    if (!probe.ok) { expect(probe.reason,).toBe("revoked",); }
  });

  test("paused resources reject with fallback before quota is touched", async () => {
    await addInferenceResource(testDb, {
      id: "inf-paused-1",
      ownerId: "user-1",
      kind: "sd",
      provider: "sd-local",
      endpoint: "http://localhost:7860",
      secret: SECRET,
    },);

    await testDb
      .updateTable("resource_records",)
      .set({ status: "paused", },)
      .where("id", "=", "inf-paused-1",)
      .execute();

    const quota = new QuotaEngine();
    let thrown: unknown;
    try {
      await checkInferenceAvailable(testDb, "inf-paused-1", quota,);
    } catch (error) {
      thrown = error;
    }

    expect(thrown,).toBeInstanceOf(ResourceUnavailableError,);
    expect((thrown as ResourceUnavailableError).fallback.length,).toBeGreaterThan(0,);
    expect(quota.peek("inf-paused-1",).requests,).toBe(0,);
  });

  test("quota breach rejects with exhausted fallback, never calling out", async () => {
    await addInferenceResource(testDb, {
      id: "inf-spent-1",
      ownerId: "user-1",
      kind: "comfyui",
      provider: "comfy-local",
      endpoint: "http://localhost:8188",
      secret: SECRET,
      quota: { requestsPerMinute: 1, },
    },);

    const quota = new QuotaEngine();
    await checkInferenceAvailable(testDb, "inf-spent-1", quota,);
    let thrown: unknown;
    try {
      await checkInferenceAvailable(testDb, "inf-spent-1", quota,);
    } catch (error) {
      thrown = error;
    }

    expect(thrown,).toBeInstanceOf(ResourceUnavailableError,);
    expect((thrown as ResourceUnavailableError).reason,).toBe("exhausted",);
  });
});

afterAll(async () => {
  await destroyTestDb({ db: testDb, sqlite: testSqlite, },);
},);
