// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the admin runtime-seed route (POST /api/admin/seed).
 *
 * Mirrors danger-zone.test.ts's app harness: the route is mounted on an
 * Elysia instance with a derived caller identity, and exercised via
 * `app.handle` — no network, real seeders against a test DB.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { AuthConfig, Config, SeedingConfig, } from "../../config/schema";
import { UserRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, resetTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { seedRoutes, } from "./seed";

function auth(required: boolean,): AuthConfig {
  return {
    required,
    registrationOpen: true,
    sessionTimeoutHours: 24,
    maxSessionsPerUser: 10,
    demoUsername: "demo",
    demoAutoSetup: false,
  };
}

function makeSeeding(): SeedingConfig {
  return {
    enabled: true,
    users: [
      { username: "player1", password: "[REDACTED:API key param]", role: UserRole.Player, },
      { username: "player2", password: "[REDACTED:API key param]", role: UserRole.Player, },
    ],
    seedData: {
      characters: [
        { name: "Orin", owner: "player1", description: "A ranger", personality: ["stoic", "wary",], },
      ],
      worlds: [
        { name: "Verdant Vale", creator: "player1", description: "A lush valley", },
      ],
    },
  };
}

function makeApp(db: Kysely<DB>, userRole: string | null,) {
  const app = new Elysia({ name: "test-seed", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? `test-user-${userRole}` : null,
    userRole,
  }));

  const config = { auth: auth(true,), seeding: makeSeeding(), } as Config;
  return app.use(seedRoutes({ database: db, config, }, "/api",),);
}

let db: Kysely<DB>;
let sqlite: TestDb["sqlite"];

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  sqlite = created.sqlite;
},);

beforeEach(() => {
  resetTestDb(sqlite,);
},);

afterAll(async () => {
  await db.destroy();
},);

describe("admin seed route", () => {
  test("returns 401 for anonymous", async () => {
    const app = makeApp(db, null,);
    const res = await app.handle(
      new Request("http://localhost/api/admin/seed", { method: "POST", },),
    );

    expect(res.status,).toBe(401,);
  });

  test("returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/seed", { method: "POST", },),
    );

    expect(res.status,).toBe(403,);
  });

  test("seeds on first call and is a no-op on the second", async () => {
    const app = makeApp(db, "admin",);
    const call = (): Promise<Response> =>
      app.handle(new Request("http://localhost/api/admin/seed", { method: "POST", },),);

    const first = await call();
    expect(first.status,).toBe(200,);
    const firstBody = (await first.json()) as { content: number; users: number };
    expect(firstBody.users,).toBe(2,);
    expect(firstBody.content,).toBeGreaterThan(0,);
    const second = await call();
    expect(second.status,).toBe(200,);
    // Skip-existing makes the repeat a no-op (stable ids).
    const secondBody = (await second.json()) as { content: number; users: number };
    expect(secondBody.users,).toBe(0,);
    expect(secondBody.content,).toBe(0,);
  });
});
