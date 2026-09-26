/**
 * Unit tests for auth routes (Elysia plugin)
 *
 * Tests the handleRegister logic via the Elysia plugin.
 * Uses mock database and config to verify behavior without a real DB.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { RateLimiter, } from "../middleware/rate-limit";
import { authPublicRoutes, createRegisterLimiter, } from "./auth";

// ── Helpers ───────────────────────────────────────────────────

/**
 * @param body
 * @param headers
 */
function makeRequest(body: string, headers?: Record<string, string>,): Request {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers, },
    body,
  },);
}

/**
 * @param overrides
 * @param overrides.registrationOpen
 */
function makeConfig(overrides?: { registrationOpen?: boolean },): any {
  return {
    auth: {
      required: true,
      registrationOpen: overrides?.registrationOpen ?? true,
      sessionTimeoutHours: 24,
      maxSessionsPerUser: 10,
      demoUsername: "demo",
      demoAutoSetup: false,
      jwtSecret: "test-secret-key-for-jwt-signing",
      jwtExpiresIn: 86_400,
    },
    encryption: { enabled: false, },
  };
}

/**
 * @param overrides
 * @param overrides.existingUser
 * @param overrides.sessionsCount
 */
function makeDb(overrides?: { existingUser?: boolean; sessionsCount?: number },): any {
  const sessionsCount = overrides?.sessionsCount ?? 0;
  // Track usernames the mock has already accepted -- simulates the
  // DB's unique-username constraint. handleRegister no longer does a
  // SELECT pre-check; it relies on insertUnique -> ON CONFLICT
  // (username) DO NOTHING to detect a duplicate. The mock returns
  // 0 rows when the username is already known so the route returns
  // the "Username already taken." inline error.
  const seenUsernames = new Set<string>();
  if (overrides?.existingUser) { seenUsernames.add("existinguser",); }
  return {
    fn: {
      countAll: () => ({ as: (_alias: string,) => "count_all_marker", }),
    },
    selectFrom: (table: string,) => ({
      select: (cols: any,) => {
        const isSessionsCount = table === "sessions" && cols === "count_all_marker";
        return {
          where: () => ({
            executeTakeFirst: async () => {
              if (isSessionsCount) { return { cnt: BigInt(sessionsCount,), }; }
              return null;
            },
          }),
        };
      },
    }),
    deleteFrom: (_table: string,) => ({
      where: () => ({
        orderBy: () => ({
          limit: () => ({ execute: async () => ({ numAffectedRows: 0n, }), }),
        }),
      }),
    }),
    insertInto: (table: string,) => ({
      values: (vals: { username?: string; id?: string } = {},) => {
        // insertUnique uses Kysely's callback form:
        //   .onConflict((oc) => oc.columns(...).doNothing()).execute()
        // The callback returns the next chainable object. We simulate
        // the ON CONFLICT DO NOTHING result by reading from the table
        // column -- when the table is `users` and the username has
        // already been accepted by the mock, the unique constraint
        // fires and the insert is dropped (0 rows). All other inserts
        // (actors, sessions, ...) report a fresh 1-row insert.
        const skipped = table === "users" && !!vals.username && seenUsernames.has(vals.username,);
        if (table === "users" && vals.username && !skipped) {
          seenUsernames.add(vals.username,);
        }
        return {
          onConflict: (cb: (oc: any,) => any,) =>
            cb({
              columns: () => ({
                doNothing: () => ({
                  // Kysely's `.execute()` returns `QueryResult` which is
                  // an ARRAY-shaped row-collection with `numInsertedOrUpdatedRows`.
                  // insertUnique indexes `result[0]` so we must hand back an
                  // array, not a plain object.
                  execute: async () => [{
                    numInsertedOrUpdatedRows: skipped ? 0n : 1n,
                  },],
                }),
              }),
            },),
          execute: async () => [{ numInsertedOrUpdatedRows: 1n, },],
        };
      },
    }),
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe("authPublicRoutes", () => {
  test("exports function", () => {
    expect(typeof authPublicRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = authPublicRoutes({ database: makeDb(), config: makeConfig(), },);
    expect(plugin,).toBeDefined();
  });
});

describe("POST /api/auth/register", () => {
  // Isolated limiter — no shared module state; destroyed after each test.
  let registerLimiter: RateLimiter;
  beforeEach(() => {
    registerLimiter = createRegisterLimiter();
  },);
  afterEach(() => {
    registerLimiter.destroy();
  },);

  /** Build the plugin with the isolated register limiter injected. */
  function makeApp(database: ReturnType<typeof makeDb>, config: ReturnType<typeof makeConfig>,) {
    return authPublicRoutes({ database, config, limiters: { registerLimiter, }, },);
  }

  test("returns error when registration is closed", async () => {
    const app = makeApp(makeDb(), makeConfig({ registrationOpen: false, },),);

    const req = makeRequest("username=testuser&password=secret123",);
    const res = await app.handle(req,);

    expect(res.status,).toBe(200,);
    const body = await res.text();
    expect(body,).toContain("Registration is closed.",);
  });

  test("returns error for missing username", async () => {
    const app = makeApp(makeDb(), makeConfig(),);

    const req = makeRequest("password=secret123",);
    const res = await app.handle(req,);

    const body = await res.text();
    expect(body,).toContain("Username and password are required.",);
  });

  test("returns error for missing password", async () => {
    const app = makeApp(makeDb(), makeConfig(),);

    const req = makeRequest("username=testuser",);
    const res = await app.handle(req,);

    const body = await res.text();
    expect(body,).toContain("Username and password are required.",);
  });

  test("returns error for username too short", async () => {
    const app = makeApp(makeDb(), makeConfig(),);

    const req = makeRequest("username=ab&password=secret123",);
    const res = await app.handle(req,);

    const body = await res.text();
    expect(body,).toContain("Username must be 3–32 characters.",);
  });

  test("returns error for username too long", async () => {
    const app = makeApp(makeDb(), makeConfig(),);

    const longUsername = "a".repeat(33,);
    const req = makeRequest(`username=${longUsername}&password=secret123`,);
    const res = await app.handle(req,);

    const body = await res.text();
    expect(body,).toContain("Username must be 3–32 characters.",);
  });

  test("returns error for password too short", async () => {
    const app = makeApp(makeDb(), makeConfig(),);

    const req = makeRequest("username=testuser&password=12345",);
    const res = await app.handle(req,);

    const body = await res.text();
    expect(body,).toContain("Password must be at least 6 characters.",);
  });

  test("returns error for duplicate username", async () => {
    const app = makeApp(makeDb({ existingUser: true, },), makeConfig(),);

    const req = makeRequest("username=existinguser&password=secret123",);
    const res = await app.handle(req,);

    const body = await res.text();
    expect(body,).toContain("Username already taken.",);
  });

  test("rate limits registration attempts", async () => {
    const app = makeApp(makeDb({ existingUser: true, },), makeConfig(),);

    // Exhaust rate limit (3 per hour)
    for (let i = 0; i < 3; i++) {
      const req = makeRequest(`username=user${i}&password=secret123`,);
      await app.handle(req,);
    }

    // 4th attempt should be rate limited
    const req = makeRequest("username=user4&password=secret123",);
    const res = await app.handle(req,);

    expect(res.status,).toBe(429,);
    const body = await res.text();
    expect(body,).toContain("Too many registration attempts",);
  });

  test("successful registration returns 200 with HX-Redirect", async () => {
    const db = makeDb();
    const app = makeApp(db, makeConfig(),);

    const req = makeRequest("username=newuser&password=secret123",);
    const res = await app.handle(req,);

    expect(res.status,).toBe(200,);
    expect(res.headers.get("HX-Redirect",),).toBe("/views/chat",);
    const cookieHeader = res.headers.get("Set-Cookie",);
    expect(cookieHeader,).toContain("ll_token=",);
    expect(cookieHeader,).toContain("HttpOnly",);
  });

  test("concurrent same-username registrations: only one wins (BUG-register-username-race)", async () => {
    // Regression: before the insertUnique fix, handleRegister did a
    // SELECT-then-INSERT -- two concurrent calls with the same username
    // both passed the existence check, then the second hit the unique
    // constraint with an uncaught 500. The fix collapses the check +
    // insert into a single INSERT ... ON CONFLICT (username) DO NOTHING
    // via insertUnique; the loser of the race sees "skipped" and gets
    // a clean inline-error response (the htmx swap contract returns
    // 200 + "Username already taken." rather than a 409 -- see
    // routes/auth/responses.ts: errorResponse keeps 200 for the inline
    // path so htmx can swap it). The pre-fix behavior would have
    // produced a 500 here for the loser.
    const app = makeApp(makeDb(), makeConfig(),);

    const [a, b,] = await Promise.all([
      app.handle(makeRequest("username=raceuser&password=" + "secret123",),),
      app.handle(makeRequest("username=raceuser&password=" + "secret123",),),
    ],);

    expect(a.status,).toBe(200,);
    expect(b.status,).toBe(200,);
    const aBody = await a.text();
    const bBody = await b.text();
    const combined = aBody + bBody;
    // Exactly one body is the inline "Username already taken." error
    // (the loser of the race) and exactly one response carries the
    // HX-Redirect header (the winner). The pre-fix code would have
    // thrown a 500 for the loser on the unique-constraint violation.
    expect(combined,).toContain("Username already taken.",);
    const redirects = [a, b,].filter((r,) => r.headers.get("HX-Redirect",) === "/views/chat").length;
    expect(redirects,).toBe(1,);
  });
});
