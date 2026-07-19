/**
 * Unit tests for auth routes (Elysia plugin)
 *
 * Tests the handleRegister logic via the Elysia plugin.
 * Uses mock database and config to verify behavior without a real DB.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { authPublicRoutes, resetRegisterRateLimiter } from "./auth";

// ── Helpers ───────────────────────────────────────────────────

function makeRequest(body: string, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body,
  });
}

function makeConfig(overrides?: { registrationOpen?: boolean }): any {
  return {
    auth: {
      required: true,
      registrationOpen: overrides?.registrationOpen ?? true,
      sessionTimeoutHours: 24,
      maxSessionsPerUser: 10,
      demoUsername: "demo",
      demoAutoSetup: false,
    },
    encryption: { enabled: false },
  };
}

function executeTakeFirst(existingUser?: boolean) {
  return async () => {
    if (existingUser) return { id: "existing-user-id" };
    return null;
  };
}

function makeDb(overrides?: { existingUser?: boolean }): any {
  return {
    selectFrom: () => ({
      select: () => ({
        where: () => ({
          executeTakeFirst: executeTakeFirst(overrides?.existingUser),
        }),
      }),
    }),
    insertInto: () => ({
      values: () => ({
        execute: async () => ({ numInsertedOrUpdatedRows: 1n }),
      }),
    }),
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe("authPublicRoutes", () => {
  test("exports function", () => {
    expect(typeof authPublicRoutes).toBe("function");
  });

  test("returns Elysia plugin", () => {
    const plugin = authPublicRoutes({ database: makeDb(), config: makeConfig() });
    expect(plugin).toBeDefined();
  });
});

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    resetRegisterRateLimiter();
  });

  test("returns error when registration is closed", async () => {
    const app = authPublicRoutes({
      database: makeDb(),
      config: makeConfig({ registrationOpen: false }),
    });

    const req = makeRequest("username=testuser&password=secret123");
    const res = await app.handle(req);

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Registration is closed.");
  });

  test("returns error for missing username", async () => {
    const app = authPublicRoutes({
      database: makeDb(),
      config: makeConfig(),
    });

    const req = makeRequest("password=secret123");
    const res = await app.handle(req);

    const body = await res.text();
    expect(body).toContain("Username and password are required.");
  });

  test("returns error for missing password", async () => {
    const app = authPublicRoutes({
      database: makeDb(),
      config: makeConfig(),
    });

    const req = makeRequest("username=testuser");
    const res = await app.handle(req);

    const body = await res.text();
    expect(body).toContain("Username and password are required.");
  });

  test("returns error for username too short", async () => {
    const app = authPublicRoutes({
      database: makeDb(),
      config: makeConfig(),
    });

    const req = makeRequest("username=ab&password=secret123");
    const res = await app.handle(req);

    const body = await res.text();
    expect(body).toContain("Username must be 3–32 characters.");
  });

  test("returns error for username too long", async () => {
    const app = authPublicRoutes({
      database: makeDb(),
      config: makeConfig(),
    });

    const longUsername = "a".repeat(33);
    const req = makeRequest(`username=${longUsername}&password=secret123`);
    const res = await app.handle(req);

    const body = await res.text();
    expect(body).toContain("Username must be 3–32 characters.");
  });

  test("returns error for password too short", async () => {
    const app = authPublicRoutes({
      database: makeDb(),
      config: makeConfig(),
    });

    const req = makeRequest("username=testuser&password=12345");
    const res = await app.handle(req);

    const body = await res.text();
    expect(body).toContain("Password must be at least 6 characters.");
  });

  test("returns error for duplicate username", async () => {
    const app = authPublicRoutes({
      database: makeDb({ existingUser: true }),
      config: makeConfig(),
    });

    const req = makeRequest("username=existinguser&password=secret123");
    const res = await app.handle(req);

    const body = await res.text();
    expect(body).toContain("Username already taken.");
  });

  test("rate limits registration attempts", async () => {
    const app = authPublicRoutes({
      database: makeDb({ existingUser: true }),
      config: makeConfig(),
    });

    // Exhaust rate limit (3 per hour)
    for (let i = 0; i < 3; i++) {
      const req = makeRequest(`username=user${i}&password=secret123`);
      await app.handle(req);
    }

    // 4th attempt should be rate limited
    const req = makeRequest("username=user4&password=secret123");
    const res = await app.handle(req);

    expect(res.status).toBe(429);
    const body = await res.text();
    expect(body).toContain("Too many registration attempts");
  });

  test("successful registration returns 200 with HX-Redirect", async () => {
    const db = makeDb();
    const app = authPublicRoutes({
      database: db,
      config: makeConfig(),
    });

    const req = makeRequest("username=newuser&password=secret123");
    const res = await app.handle(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("HX-Redirect")).toBe("/views/chat");
    const cookieHeader = res.headers.get("Set-Cookie");
    expect(cookieHeader).toContain("ll_token=");
    expect(cookieHeader).toContain("HttpOnly");
  });
});
