// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the setup-state endpoint (GET /api/v1/setup/state).
 *
 * Verifies:
 *   - 401 for anonymous callers, 403 for non-admins, 200 for admins
 *   - the six stable check ids, identical across calls
 *   - the fresh-clone env/PII check names NSFW_PII_SECRET in prod mode
 *
 * Deterministic: no network, no ports, no sleeps.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { setupRoutes, } from "./routes";

/** The stable, documented check ids. */
const STABLE_IDS = ["env.pii", "provider.health", "smk", "model.roles", "native", "tls",];

/** Minimal config: no generation section, no TLS paths, no PII secrets. */
function testConfig(): Config {
  return {
    server: { tls: { key: "/nonexistent/setup-state/key.pem", cert: "/nonexistent/setup-state/cert.pem", }, },
  } as unknown as Config;
}

/**
 * @param db
 * @param userRole - null for an anonymous caller.
 */
function makeApp(db: Kysely<DB> | undefined, userRole: string | null,) {
  const app = new Elysia({ name: "test-setup", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? "user-1" : null,
    userRole,
  }));

  return app.use(setupRoutes({ database: db, config: testConfig(), }, "/api",),);
}

let db: Kysely<DB>;
// TestDb imported from create-test-db.ts
let sqlite: TestDb["sqlite"];

beforeAll(async () => {
  const tdb = await createTestDb();
  db = tdb.db;
  sqlite = tdb.sqlite;
},);

afterAll(async () => {
  sqlite.close();
},);

describe("setup state route", () => {
  test("GET /api/setup/state returns 401 for anonymous", async () => {
    const app = makeApp(db, null,);
    const res = await app.handle(new Request("http://localhost/api/setup/state",),);
    expect(res.status,).toBe(401,);
  });

  test("GET /api/setup/state returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(new Request("http://localhost/api/setup/state",),);
    expect(res.status,).toBe(403,);
  });

  test("GET /api/setup/state returns 200 with the six stable check ids for admin", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/setup/state",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { checks: Array<{ id: string; ok: boolean; hint?: string }> };
    expect(Array.isArray(body.checks,),).toBe(true,);
    expect(body.checks.length,).toBe(STABLE_IDS.length,);
    for (const id of STABLE_IDS) {
      expect(body.checks.some((check,) => check.id === id),).toBe(true,);
    }

    for (const check of body.checks) {
      expect(typeof check.id,).toBe("string",);
      expect(typeof check.ok,).toBe("boolean",);
    }
  });

  test("the check ids are stable across calls", async () => {
    const app = makeApp(db, "admin",);
    const first = await app.handle(new Request("http://localhost/api/setup/state",),);
    const second = await app.handle(new Request("http://localhost/api/setup/state",),);
    const firstBody = await first.json() as { checks: Array<{ id: string }> };
    const secondBody = await second.json() as { checks: Array<{ id: string }> };
    expect(firstBody.checks.map((check,) => check.id),).toEqual(secondBody.checks.map((check,) => check.id),);
  });

  test("on a fresh clone the env/PII check names NSFW_PII_SECRET", async () => {
    const savedNodeEnv = process.env["NODE_ENV"];
    const secretEnvVars = [
      "NSFW_PII_SECRET",
      "NSFW_FLAG_REPORTER_HASH_SECRET",
      "NSFW_MODERATION_HMAC_SECRET",
      "TELEMETRY_PII_SECRET",
    ];

    const savedSecrets = secretEnvVars.map((name,) => [name, process.env[name],] as const);

    process.env["NODE_ENV"] = "production";
    for (const name of secretEnvVars) { delete process.env[name]; }

    try {
      const app = makeApp(db, "admin",);
      const res = await app.handle(new Request("http://localhost/api/setup/state",),);
      expect(res.status,).toBe(200,);
      const body = await res.json() as { checks: Array<{ id: string; ok: boolean; hint?: string }> };

      const pii = body.checks.find((check,) => check.id === "env.pii");
      expect(pii?.ok,).toBe(false,);
      expect(pii?.hint ?? "",).toContain("NSFW_PII_SECRET",);
    } finally {
      if (savedNodeEnv === undefined) {
        delete process.env["NODE_ENV"];
      } else {
        process.env["NODE_ENV"] = savedNodeEnv;
      }

      for (const [name, value,] of savedSecrets) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    }
  });
});
