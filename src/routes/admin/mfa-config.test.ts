// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the admin MFA config surface: permission gates, secret redaction,
 * boundary validation, and PATCH → GET round trip.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { initSmk, } from "../../crypto/smk";
import type { DB, } from "../../db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { mfaConfigRoutes, } from "./mfa-config";

const TOKEN = "super-secret-bot-token";
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
  // Reset the process-global SMK so sibling suites do not inherit the test key.
  await initSmk({ required: false, compressThreshold: 1024, compressAlgorithm: "gzip", },);
  await destroyTestDb(fixture,);
},);

function makeApp(userRole: string | null, prefix = "/api",) {
  const app = new Elysia({ name: "test-mfa-config", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? `test-user-${userRole}` : null,
    userRole,
  }));

  return app.use(mfaConfigRoutes({ database: db, config: {} as Config, }, prefix,),);
}

function handle(app: Elysia, method: "GET" | "PATCH", urlPath: string, body?: unknown,): Promise<Response> {
  return app.handle(
    new Request(`http://localhost${urlPath}`, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { "content-type": "application/json", }, body: JSON.stringify(body,), }),
    },),
  );
}

interface MfaView {
  email: { sender: string; windowMs: number; configured: boolean };
  messenger: { sender: string; windowMs: number; tokenConfigured: boolean };
}

describe("admin MFA config routes", () => {
  test("GET returns 401 for anonymous and 403 for non-admin", async () => {
    expect((await handle(makeApp(null,), "GET", "/api/admin/mfa/config",)).status,).toBe(401,);
    expect((await handle(makeApp("user",), "GET", "/api/admin/mfa/config",)).status,).toBe(403,);
  });

  test("GET reports defaults with no token configured", async () => {
    const res = await handle(makeApp("admin",), "GET", "/api/admin/mfa/config",);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as MfaView;
    expect(body.email.sender.length,).toBeGreaterThan(0,);
    expect(body.email.windowMs,).toBeGreaterThan(0,);
    expect(body.email.configured,).toBe(false,);
    expect(body.messenger.sender.length,).toBeGreaterThan(0,);
    expect(body.messenger.windowMs,).toBeGreaterThan(0,);
    expect(body.messenger.tokenConfigured,).toBe(false,);
    expect(JSON.stringify(body,),).not.toContain(TOKEN,);
  });

  test("PATCH denies non-admin without writing", async () => {
    const res = await handle(makeApp("user",), "PATCH", "/api/admin/mfa/config", {
      email: { sender: "attacker@example.com", },
    },);

    expect(res.status,).toBe(403,);
    const after = await handle(makeApp("admin",), "GET", "/api/admin/mfa/config",);
    const body = (await after.json()) as MfaView;
    expect(body.email.configured,).toBe(false,);
  });

  test("rejects blank senders/token and non-positive windows", async () => {
    const app = makeApp("admin",);
    const cases: unknown[] = [
      { email: { sender: "   ", }, },
      { email: { windowMs: 0, }, },
      { email: { windowMs: -1, }, },
      { messenger: { sender: "", }, },
      { messenger: { botToken: "  ", }, },
      { messenger: { windowMs: 0, }, },
    ];

    for (const body of cases) {
      const res = await handle(app, "PATCH", "/api/admin/mfa/config", body,);
      expect(res.status,).toBe(400,);
    }
  });

  test("PATCH is reflected by a later GET and never leaks the bot token", async () => {
    const app = makeApp("admin",);
    const res = await handle(app, "PATCH", "/api/admin/mfa/config", {
      email: { sender: "mfa@example.com", windowMs: 123_000, },
      messenger: { sender: "my-mfa-bot", botToken: TOKEN, windowMs: 91_000, },
    },);

    expect(res.status,).toBe(200,);
    const patchedText = await res.text();
    expect(patchedText,).not.toContain(TOKEN,);

    const after = await handle(makeApp("admin",), "GET", "/api/admin/mfa/config",);
    expect(after.status,).toBe(200,);
    const afterText = await after.text();
    expect(afterText,).not.toContain(TOKEN,);
    const body = JSON.parse(afterText,) as MfaView;
    expect(body.email,).toEqual({ sender: "mfa@example.com", windowMs: 123_000, configured: true, },);
    expect(body.messenger,).toEqual({ sender: "my-mfa-bot", windowMs: 91_000, tokenConfigured: true, },);
  });

  test("serves the same contract at the v1 prefix", async () => {
    const res = await handle(makeApp("admin", "/api/v1",), "GET", "/api/v1/admin/mfa/config",);
    expect(res.status,).toBe(200,);
  });
});
