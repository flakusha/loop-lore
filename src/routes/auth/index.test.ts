// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Auth barrel composition tests.
 * Mounts authProtectedRoutes with no session identity: the guards must
 * answer before any store access (logout 200 no-op, me/verify 401).
 * Pins the index/challenge-routes split — every protected path stays
 * reachable through the .use() composition.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { authProtectedRoutes, } from "./index";

let fixture: TestDb | undefined;
let db: Kysely<DB>;

beforeEach(async () => {
  fixture = await createTestDb();
  db = fixture.db;
},);

afterEach(async () => {
  if (fixture) {
    await destroyTestDb(fixture,);
    fixture = undefined;
  }
},);

/** Mount the protected barrel with no derived identity. */
function anonymousApp(): Elysia {
  return new Elysia().use(authProtectedRoutes({ database: db, config: {} as never, }, "/api",),);
}

describe("authProtectedRoutes without identity", () => {
  test("logout is a 200 cookie-clearing no-op", async () => {
    const app = anonymousApp();
    const res = await app.handle(new Request("http://localhost/api/auth/logout", { method: "POST", },),);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("set-cookie",) ?? "",).toContain("Max-Age=0",);
  });

  test("me without identity is 401", async () => {
    const app = anonymousApp();
    const res = await app.handle(new Request("http://localhost/api/auth/me",),);
    expect(res.status,).toBe(401,);
  });

  test("verify without identity is 401 before any store access", async () => {
    const app = anonymousApp();
    const res = await app.handle(
      new Request("http://localhost/api/auth/factors/verify", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ challengeId: "no-such-challenge", code: "000000", purpose: "login", },),
      },),
    );

    expect(res.status,).toBe(401,);
  });
});
