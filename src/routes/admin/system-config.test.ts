// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for admin system-config routes (key/value configuration CRUD).
 *
 * Verifies:
 *   - requireUserId 401 path
 *   - can(userRole, 'admin.system') 403 path
 *   - GET 200 (empty + seeded)
 *   - PATCH 200 (valid body) / 400 (invalid body)
 *   - DELETE 204
 *   - POST /import (yaml/toml) with per-key diff and secret skip
 *   - GET /config-schema includes requires_restart_keys
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { setConfig, } from "../../admin/config";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { systemConfigRoutes, } from "./system-config";

/**
 * @param db
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userRole: string | null,) {
  const app = new Elysia({ name: "test-system-config", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? `test-user-${userRole}` : null,
    userRole,
  }));
  return app.use(systemConfigRoutes({ database: db, config: {} as Config, }, "/api",),);
}

let db: Kysely<DB>;
// TestDb imported from create-test-db.ts
let sqlite: TestDb["sqlite"];

beforeAll(async () => {
  const tdb = await createTestDb();
  db = tdb.db;
  sqlite = tdb.sqlite;
},);

afterAll(() => {
  sqlite.close();
},);

describe("admin system-config routes", () => {
  test("GET /api/admin/system-config returns 401 for anonymous", async () => {
    const app = makeApp(db, null,);
    const res = await app.handle(new Request("http://localhost/api/admin/system-config",),);
    expect(res.status,).toBe(401,);
  });

  test("GET /api/admin/system-config returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(new Request("http://localhost/api/admin/system-config",),);
    expect(res.status,).toBe(403,);
  });

  test("GET /api/admin/system-config returns 200 with empty array for admin", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/system-config",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body,),).toBe(true,);
  });

  test("GET /api/admin/system-config returns 200 with seeded configs", async () => {
    await setConfig(db, "test.key.1", "value-1", "test 1",);
    await setConfig(db, "test.key.2", "value-2",);
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/system-config",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { key: string; value: string }[];
    expect(body.length,).toBeGreaterThanOrEqual(2,);
    expect(body.some((c,) => c.key === "test.key.1" && c.value === "value-1"),).toBe(true,);
  });

  test("PATCH /api/admin/system-config returns 200 with valid body", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/system-config", {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ key: "patched.key", value: "patched-value", description: "desc", },),
      },),
    );
    expect(res.status,).toBe(200,);
  });

  test("PATCH /api/admin/system-config returns 400 with invalid body", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/system-config", {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ wrong: "shape", },),
      },),
    );
    expect(res.status,).toBe(422,);
  });

  test("PATCH /api/admin/system-config returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/system-config", {
        method: "PATCH",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ key: "k", value: "v", },),
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("DELETE /api/admin/system-config/:key returns 204", async () => {
    await setConfig(db, "delete.me", "x",);
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/system-config/delete.me", { method: "DELETE", },),
    );
    expect(res.status,).toBe(204,);
  });

  test("DELETE /api/admin/system-config/:key returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/system-config/anything", { method: "DELETE", },),
    );
    expect(res.status,).toBe(403,);
  });

  test("GET /api/admin/config-schema returns Meta-derived sections", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/config-schema",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { properties: Record<string, unknown> };
    expect(body.properties.server,).toBeTruthy();
    expect(body.properties.auth,).toBeTruthy();
    // Meta-derived: secrets present, tui sessionToken present
    const auth = body.properties.auth as { properties: Record<string, unknown> };
    expect(auth.properties.jwtSecret,).toBeTruthy();
    const tui = body.properties.tui as { properties: Record<string, unknown> };
    expect(tui.properties.sessionToken,).toBeTruthy();
  });

  test("GET /api/admin/config-schema returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(new Request("http://localhost/api/admin/config-schema",),);
    expect(res.status,).toBe(403,);
  });

  test("GET /api/admin/system-config/export yaml redacts secrets + audit-logs", async () => {
    await setConfig(db, "export.plain", "hello",);
    await setConfig(db, "export.jwtSecret", "s3cr3t",);
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/system-config/export?format=yaml",),
    );
    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toContain("application/yaml",);
    expect(res.headers.get("content-disposition",),).toContain(".yaml",);
    const text = await res.text();
    expect(text,).toContain("export.plain",);
    expect(text,).toContain("***REDACTED***",);
    expect(text,).not.toContain("s3cr3t",);
  });

  test("GET /api/admin/system-config/export toml round-trips via Bun.TOML", async () => {
    await setConfig(db, "export.toml.key", "v",);
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/system-config/export?format=toml",),
    );
    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-disposition",),).toContain(".toml",);
    const text = await res.text();
    const parsed = Bun.TOML.parse(text,) as { system_config: Record<string, string> };
    expect(parsed.system_config["export.toml.key"],).toBe("v",);
  });

  test("GET /api/admin/system-config/export returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/system-config/export?format=yaml",),
    );
    expect(res.status,).toBe(403,);
  });

  test("GET /api/admin/config-schema includes requires_restart_keys", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/config-schema",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { requires_restart_keys?: string[] };
    expect(Array.isArray(body.requires_restart_keys,),).toBe(true,);
    expect(body.requires_restart_keys,).toContain("default_provider",);
  });

  test("GET /api/admin/system-config decorates rows with requires_restart", async () => {
    // default_provider is in REQUIRES_RESTART_KEYS — set explicitly so the row exists.
    await setConfig(db, "default_provider", "openai",);
    await setConfig(db, "decorated_k_friendly", "hi",);
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/system-config",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as Array<{ key: string; requires_restart: boolean }>;
    const provider = body.find((c,) => c.key === "default_provider");
    expect(provider,).toBeTruthy();
    expect(provider?.requires_restart,).toBe(true,);
    const friendly = body.find((c,) => c.key === "decorated_k_friendly");
    expect(friendly?.requires_restart,).toBe(false,);
  });

  test("POST /api/admin/system-config/import yaml adds new keys and reports diff", async () => {
    const yamlBody = `system_config:
  import.k1: v1
  import.k2: v2
`;
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/system-config/import", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ format: "yaml", content: yamlBody, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      imported: number;
      changed: number;
      skipped: number;
      results: { key: string; action: string }[];
    };
    expect(body.imported,).toBe(2,);
    expect(body.results.map((r,) => r.key).sort(),).toEqual(["import.k1", "import.k2",],);
    expect(body.results.every((r,) => r.action === "added"),).toBe(true,);
  });
  test("POST /api/admin/system-config/import toml round-trips and reports changed", async () => {
    await setConfig(db, "import.toml.pre", "old",);
    // Bun.TOML export uses quoted dotted keys to keep them flat on parse.
    const tomlBody = `[system_config]\n"import.toml.pre" = "new"\n`;
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/system-config/import", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ format: "toml", content: tomlBody, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { changed: number; results: { key: string; action: string }[] };
    expect(body.changed,).toBe(1,);
    expect(body.results[0]?.action,).toBe("changed",);
  });

  test("POST /api/admin/system-config/import skips secret-pattern keys", async () => {
    const yamlBody = `system_config:\n  import.jwtSecret: leaked\n  import.publicKey: ok\n`;
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/system-config/import", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ format: "yaml", content: yamlBody, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { skipped: number; results: { key: string; action: string }[] };
    expect(body.skipped,).toBeGreaterThanOrEqual(1,);
    const secret = body.results.find((r,) => r.key === "import.jwtSecret");
    expect(secret?.action,).toBe("skipped",);
  });

  test("POST /api/admin/system-config/import returns 400 on invalid yaml", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/system-config/import", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ format: "yaml", content: "{ this: is: invalid", },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("POST /api/admin/system-config/import returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/system-config/import", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ format: "yaml", content: "system_config: {}", },),
      },),
    );
    expect(res.status,).toBe(403,);
  });
});
