// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * T1 RBAC: roles without `import.own` get 403 on POST /api/actors/import
 * with no actor row written; `user` still imports (201).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { signJwt, } from "../../auth/jwt";
import type { AuthConfig, } from "../../config/schema/auth";
import { UserRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertSessions, insertUsers, } from "../../test-utils/insert-helpers";
import { importRoutes, } from "./index";

const JWT_SECRET = "test-secret-must-be-at-least-32-chars-long-aaaa";

const AUTH_CONFIG = {
  required: true,
  registrationOpen: false,
  sessionTimeoutHours: 24,
  maxSessionsPerUser: 5,
  demoUsername: "demo",
  demoAutoSetup: false,
  jwtSecret: JWT_SECRET,
  legacyOpaqueTokenFallback: false,
} as const satisfies AuthConfig;

function card(name: string,): FormData {
  const fd = new FormData();
  fd.append(
    "file",
    new File(
      [JSON.stringify({
        spec: "chara_card_v2",
        spec_version: "2.0",
        data: {
          name,
          description: "Imported",
          first_mes: "Hi",
        },
      },),],
      `${name}.json`,
      { type: "application/json", },
    ),
  );

  return fd;
}

describe("importRoutes — import.own gate", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    await insertUsers(db, "import-user", "Import User",);
    await insertUsers(db, "import-viewer", "Import Viewer", { role: "viewer", } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  async function tokenFor(username: string, role: UserRole,): Promise<string> {
    const { id, } = await db.selectFrom("users",).select("id",).where("username", "=", username,)
      .executeTakeFirstOrThrow();

    const sessionId = await insertSessions(
      db,
      id,
      `hash-${username}`,
      new Date(Date.now() + 86_400_000,).toISOString(),
    );

    return signJwt({ secret: JWT_SECRET, userId: id, role, sessionId, expiresInSeconds: 3600, },);
  }

  function app(): Elysia {
    return new Elysia({ name: "test-import-rbac", },)
      .use(importRoutes({ database: db, config: { auth: AUTH_CONFIG, }, },),) as unknown as Elysia;
  }

  async function countActors(): Promise<number> {
    const row = await db.selectFrom("actors",).select((eb,) => eb.fn.countAll().as("n",))
      .executeTakeFirstOrThrow();

    return Number(row.n,);
  }

  test("viewer role gets 403 and writes no actor row", async () => {
    const before = await countActors();
    const token = await tokenFor("import-viewer", UserRole.Viewer,);
    const res = await app().handle(
      new Request("http://localhost/api/actors/import", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, },
        body: card("Denied Import",),
      },),
    );

    expect(res.status,).toBe(403,);
    expect(await countActors(),).toBe(before,);
  });

  test("user role still imports", async () => {
    const token = await tokenFor("import-user", UserRole.User,);
    const res = await app().handle(
      new Request("http://localhost/api/actors/import", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, },
        body: card("Allowed Import",),
      },),
    );

    expect(res.status,).toBe(201,);
  });
});
