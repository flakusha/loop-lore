// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for admin SD status routes.
 *
 * Verifies:
 *   - 401 when no userId (anonymous)
 *   - 403 when user lacks admin.system
 *   - 200 for admin with default port
 *   - 200 for admin with custom configured port
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { sdStatusRoutes, } from "./sd-status";

/**
 * @param db
 * @param userRole
 * @param config
 * @param userId
 */
function makeApp(
  db: Kysely<DB>,
  userRole: string | null,
  config: Config,
  userId: string | null = userRole ? `test-user-${userRole}` : null,
) {
  const app = new Elysia({ name: "test-sd-status", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId,
    userRole,
  }));
  return app.use(sdStatusRoutes({ database: db, config, }, "/api",),);
}

describe("admin sd-status routes", () => {
  test("GET /api/admin/sd-status returns 401 for anonymous", async () => {
    const { db, } = await createTestDb();
    const app = makeApp(db, null, {} as Config,);
    const res = await app.handle(new Request("http://localhost/api/admin/sd-status",),);
    expect(res.status,).toBe(401,);
  });

  test("GET /api/admin/sd-status returns 403 for non-admin", async () => {
    const { db, } = await createTestDb();
    const app = makeApp(db, "user", {} as Config,);
    const res = await app.handle(new Request("http://localhost/api/admin/sd-status",),);
    expect(res.status,).toBe(403,);
  });

  test("GET /api/admin/sd-status returns 200 for admin with default port", async () => {
    const { db, } = await createTestDb();
    const app = makeApp(db, "admin", {} as Config,);
    const res = await app.handle(new Request("http://localhost/api/admin/sd-status",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { status: string; port: number; latencyMs: number | null };
    // sd-cpp is not running in test env → status="stopped"; default port 9010
    expect(body.port,).toBe(9010,);
    expect(["stopped", "unknown",],).toContain(body.status,);
  });

  test("GET /api/admin/sd-status honors configured port", async () => {
    const { db, } = await createTestDb();
    const config = {
      generation: { autoStart: { sdCpp: { port: 7777, }, }, },
    } as unknown as Config;
    const app = makeApp(db, "admin", config,);
    const res = await app.handle(new Request("http://localhost/api/admin/sd-status",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { port: number };
    expect(body.port,).toBe(7777,);
  });

  test("GET /api/admin/sd-status returns 403 for moderator (lacks admin.system)", async () => {
    const { db, } = await createTestDb();
    const app = makeApp(db, "moderator", {} as Config,);
    const res = await app.handle(new Request("http://localhost/api/admin/sd-status",),);
    expect(res.status,).toBe(403,);
  });
},);
