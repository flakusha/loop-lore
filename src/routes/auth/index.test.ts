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
import { FactorKind, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { RateLimiter, } from "../../middleware/rate-limit";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { authProtectedRoutes, } from "./index";
import { createEnrollLimiter, } from "./shared";

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

/** Minimal request-handling surface shared by the mounted test apps. */
type TestApp = { handle(request: Request,): Promise<Response> };

/** Mount the protected barrel with no derived identity. */
function anonymousApp(): Elysia {
  return new Elysia().use(authProtectedRoutes({ database: db, config: {} as never, }, "/api",),);
}

/** Mount the protected barrel with a derived identity and isolated limiter. */
function identifiedApp(
  userId: string,
  enrollLimiter: RateLimiter = createEnrollLimiter(),
): TestApp {
  return new Elysia()
    .derive(() => ({ userId, sessionId: `sess-${userId}`, userRole: "user", }))
    .use(authProtectedRoutes({
      database: db,
      config: {} as never,
      limiters: { enrollLimiter, },
    }, "/api",),);
}

/** POST a factor enrollment body through the mounted route. */
function postEnroll(app: TestApp, body: unknown,): Promise<Response> {
  return app.handle(
    new Request("http://localhost/api/auth/factors", {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
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

describe("POST /api/v1/auth/factors", () => {
  test("enrolls a destination for the authenticated caller", async () => {
    const userId = await insertUsers(db, "factor-user", "Factor User",);
    const res = await postEnroll(identifiedApp(userId,), {
      kind: "email",
      target: "  user@example.com  ",
    },);

    expect(res.status,).toBe(200,);
    const body = await res.json() as { factorId: string };
    expect(typeof body.factorId,).toBe("string",);

    const row = await db
      .selectFrom("auth_factors",)
      .select(["id", "user_id", "kind", "target", "verified_at",],)
      .where("id", "=", body.factorId,)
      .executeTakeFirst();

    expect(row?.user_id,).toBe(userId,);
    expect(row?.kind,).toBe(FactorKind.Email,);
    expect(row?.target,).toBe("user@example.com",);
    expect(row?.verified_at,).toBeNull();
  });

  test("requires identity and a valid TypeBox body", async () => {
    const res = await postEnroll(anonymousApp(), { kind: "email", target: "user@example.com", },);
    expect(res.status,).toBe(401,);

    const userId = await insertUsers(db, "factor-user", "Factor User",);
    const invalid = await postEnroll(identifiedApp(userId,), { kind: "carrier-pigeon", target: "x", },);
    expect(invalid.status,).toBe(422,);
    expect(await db.selectFrom("auth_factors",).selectAll().execute(),).toHaveLength(0,);
  });

  test("rate limits repeated enrollment for one user", async () => {
    const userId = await insertUsers(db, "factor-user", "Factor User",);
    const limiter = createEnrollLimiter();
    const app = identifiedApp(userId, limiter,);
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      statuses.push((await postEnroll(app, { kind: "email", target: `u${attempt}@example.com`, },)).status,);
    }

    expect(statuses,).toEqual([200, 200, 200, 200, 200, 429,],);
    expect(await db.selectFrom("auth_factors",).selectAll().execute(),).toHaveLength(5,);
  });
});
