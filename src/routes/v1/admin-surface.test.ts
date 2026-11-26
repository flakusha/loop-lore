// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The two new admin config surfaces must be reachable through the v1 barrel
 * with the same admin-permission gate as every other admin route.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { initSmk, } from "../../crypto/smk";
import type { DB, } from "../../db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { adminSurface, } from "./admin-surface";

let fixture: TestDb;
let db: Kysely<DB>;

beforeAll(async () => {
  fixture = await createTestDb();
  db = fixture.db;
  await initSmk({
    serverEncryptionKey: "f".repeat(64,),
    required: false,
    compressThreshold: 1024,
    compressAlgorithm: "gzip",
  },);
},);

afterAll(async () => {
  await initSmk({ required: false, compressThreshold: 1024, compressAlgorithm: "gzip", },);
  await destroyTestDb(fixture,);
},);

function makeSurface(userRole: string | null,) {
  return new Elysia({ name: "test-v1-admin-surface-config", },)
    .derive((): { userId: string | null; userRole: string | null } => ({
      userId: userRole ? `test-user-${userRole}` : null,
      userRole,
    }))
    .use(adminSurface({ database: db, config: {} as never, asyncStore: {} as never, },),);
}

describe("v1 admin surface — config endpoints", () => {
  test("GET /api/v1/admin/mfa/config is admin-gated and shaped", async () => {
    expect(
      (await makeSurface("user",).handle(
        new Request("http://localhost/api/v1/admin/mfa/config",),
      )).status,
    ).toBe(403,);

    const res = await makeSurface("admin",).handle(new Request("http://localhost/api/v1/admin/mfa/config",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as {
      email: { sender: string; windowMs: number; configured: boolean };
      messenger: { sender: string; windowMs: number; tokenConfigured: boolean };
    };

    expect(Object.keys(body,).sort(),).toEqual(["email", "messenger",],);
    expect(body.email.configured,).toBe(false,);
    expect(body.messenger.tokenConfigured,).toBe(false,);
  });

  test("GET /api/v1/admin/llama-swap/status is admin-gated and shaped", async () => {
    expect(
      (await makeSurface("user",).handle(
        new Request("http://localhost/api/v1/admin/llama-swap/status",),
      )).status,
    ).toBe(403,);

    const res = await makeSurface("admin",).handle(
      new Request("http://localhost/api/v1/admin/llama-swap/status",),
    );

    expect(res.status,).toBe(200,);
    const body = (await res.json()) as {
      configured: boolean;
      autoStartEnabled: boolean;
      listenPort: number | null;
      configPath: string | null;
      running: boolean;
    };

    expect(Object.keys(body,).sort(),).toEqual([
      "autoStartEnabled",
      "configPath",
      "configured",
      "listenPort",
      "running",
    ],);

    expect(body.running,).toBe(false,);
  });
});
