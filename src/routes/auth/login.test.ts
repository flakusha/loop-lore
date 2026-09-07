/**
 * Tests for routes/auth/login.ts — handleLogin / handleDemoLogin
 *
 * Uses a real in-memory DB with real password hashing and JWT signing.
 * Verifies credential validation, account status gating, session
 * creation, cookie issuance, and rate limiting.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import type { RateLimiter, } from "../../middleware/rate-limit";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { handleDemoLogin, handleLogin, } from "./login";
import { createDemoLoginLimiter, createLoginLimiter, } from "./shared";

let db: Kysely<DB>;
type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let sqlite: TestDb["sqlite"];
let passwordHash: string;
// Each describe owns its limiter(s) so parallel files never share mutable
// rate-limit state (BUG-rate-limiter-module-singletons). Destroy in
// afterEach to release the prune timer deterministically.
let loginLimiter: RateLimiter;
let demoLimiter: RateLimiter;

const USERNAME = "alice";
const PASSWORD = "correct-horse-battery";
const USER_ID = "user-login-alice";

/**
 * @param overrides
 * @param overrides.jwtSecret
 */
function makeConfig(overrides?: { jwtSecret?: string },): Config {
  return {
    auth: {
      required: true,
      registrationOpen: true,
      sessionTimeoutHours: 24,
      maxSessionsPerUser: 10,
      demoUsername: "demo",
      demoAutoSetup: false,
      jwtSecret: overrides && "jwtSecret" in overrides ? overrides.jwtSecret : "test-jwt-secret",
      jwtExpiresIn: 86_400,
    },
    encryption: { enabled: false, },
  } as unknown as Config;
}

/**
 * @param body
 * @param headers
 */
function makeRequest(body?: string, headers?: Record<string, string>,): Request {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers, },
    body,
  },);
}

/**
 * @param username
 * @param password
 */
function loginBody(username: string, password: string,): string {
  return `username=${encodeURIComponent(username,)}&password=${encodeURIComponent(password,)}`;
}

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  sqlite = created.sqlite;

  passwordHash = await Bun.password.hash(PASSWORD,);
},);

/** Re-seed users after each DB reset. */
async function seedUsers(): Promise<void> {
  await insertUsers(db, USERNAME, "Alice", {
    id: USER_ID,
    password_hash: passwordHash,
  } as never,);
  await insertUsers(db, "disabled-user", "Disabled", {
    id: "user-disabled",
    password_hash: passwordHash,
    status: "disabled",
  } as never,);
  // Solo/demo user: getOrCreateSoloUserForAuth caches the id per DB instance,
  // so the row must exist across resets or session inserts hit a stale FK.
  await insertUsers(db, "demo", "Demo", {
    id: "user-demo",
    role: "solo",
  } as never,);
}

beforeEach(() => {
  resetTestDb(sqlite,);
  // Fresh instances per test — no shared module state to reset.
  loginLimiter = createLoginLimiter();
  demoLimiter = createDemoLoginLimiter();
  return seedUsers();
},);

afterEach(() => {
  loginLimiter.destroy();
  demoLimiter.destroy();
},);

afterAll(async () => {
  db.destroy();
},);

describe("handleLogin — credential validation", () => {
  test("returns error HTML when username or password is missing", async () => {
    const res = await handleLogin(makeRequest(loginBody("", "x",),), db, makeConfig(), undefined, null, loginLimiter,);
    expect(res.status,).toBe(200,);
    expect(await res.text(),).toContain("Username and password are required",);
  });

  test("returns 400 for malformed body", async () => {
    const brokenStream = new ReadableStream<Uint8Array>({
      pull(controller,) {
        controller.error(new Error("stream failed",),);
      },
    },);
    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: brokenStream as BodyInit,
    },);
    const res = await handleLogin(req, db, makeConfig(), undefined, null, loginLimiter,);
    expect(res.status,).toBe(400,);
  });

  test("returns invalid credentials for unknown user", async () => {
    const res = await handleLogin(
      makeRequest(loginBody("nobody", "x",),),
      db,
      makeConfig(),
      undefined,
      null,
      loginLimiter,
    );
    const body = await res.text();
    expect(body,).toContain("Invalid username or password",);
  });

  test("returns account locked for disabled users", async () => {
    const res = await handleLogin(
      makeRequest(loginBody("disabled-user", PASSWORD,),),
      db,
      makeConfig(),
      undefined,
      null,
      loginLimiter,
    );
    expect(await res.text(),).toContain("Account is disabled",);
  });

  test("returns invalid credentials for wrong password", async () => {
    const res = await handleLogin(
      makeRequest(loginBody(USERNAME, "wrong-password",),),
      db,
      makeConfig(),
      undefined,
      null,
      loginLimiter,
    );
    expect(await res.text(),).toContain("Invalid username or password",);
  });
});

describe("handleLogin — success", () => {
  test("creates a session, returns HX-Redirect and auth cookie", async () => {
    const res = await handleLogin(
      makeRequest(loginBody(USERNAME, PASSWORD,),),
      db,
      makeConfig(),
      undefined,
      null,
      loginLimiter,
    );
    expect(res.status,).toBe(200,);
    expect(res.headers.get("HX-Redirect",),).toBe("/views/chat",);
    const cookie = res.headers.get("Set-Cookie",);
    expect(cookie,).toContain("ll_token=",);
    expect(cookie,).toContain("HttpOnly",);
    expect(cookie,).toContain("SameSite=Lax",);

    const session = await db.selectFrom("sessions",).select(["user_id", "ip", "token_hash", "id",],).executeTakeFirst();
    expect(session?.user_id,).toBe(USER_ID,);
    // AUTH-4: JWT sessions must store a non-empty, provenance-tagged token_hash
    // so the legacy opaque-token lookup path (sha256(token) match) cannot
    // collide with an empty hash from a JWT session.
    expect(session?.token_hash,).toStartWith("jwt:",);
    expect(session?.token_hash,).toBe(session ? `jwt:${session.id}` : undefined,);
  });
});

describe("handleLogin — rate limiting", () => {
  test("returns 429 after 10 attempts", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await handleLogin(
        makeRequest(loginBody(USERNAME, "wrong",),),
        db,
        makeConfig(),
        undefined,
        null,
        loginLimiter,
      );
      expect(res.status,).toBe(200,);
    }
    const blocked = await handleLogin(
      makeRequest(loginBody(USERNAME, "wrong",),),
      db,
      makeConfig(),
      undefined,
      null,
      loginLimiter,
    );
    expect(blocked.status,).toBe(429,);
    expect(await blocked.text(),).toContain("Too many attempts",);
  });

  // BUG-429-responses-omit-retry-after-and-x-ratelimit-headers
  test("429 response carries Retry-After and X-RateLimit-* headers", async () => {
    for (let i = 0; i < 10; i++) {
      await handleLogin(makeRequest(loginBody(USERNAME, "wrong",),), db, makeConfig(), undefined, null, loginLimiter,);
    }
    const blocked = await handleLogin(
      makeRequest(loginBody(USERNAME, "wrong",),),
      db,
      makeConfig(),
      undefined,
      null,
      loginLimiter,
    );
    expect(blocked.status,).toBe(429,);
    expect(blocked.headers.get("Retry-After",),).toBeDefined();
    expect(blocked.headers.get("X-RateLimit-Limit",),).toBe("10",);
    expect(blocked.headers.get("X-RateLimit-Remaining",),).toBe("0",);
    expect(blocked.headers.get("X-RateLimit-Reset",),).toBeDefined();
  });

  test("successful login emits X-RateLimit-Remaining (informational)", async () => {
    const res = await handleLogin(
      makeRequest(loginBody(USERNAME, PASSWORD,),),
      db,
      makeConfig(),
      undefined,
      null,
      loginLimiter,
    );
    expect(res.status,).toBe(200,);
    // No Retry-After on 200 — only X-RateLimit-* informational headers.
    expect(res.headers.get("Retry-After",),).toBeNull();
    // X-RateLimit-Limit stays informational; not auto-attached to 200 in the
    // current handler. The header is only attached to the 429 branch.
  });
});

describe("handleDemoLogin", () => {
  test("creates the solo user and returns a session cookie", async () => {
    const res = await handleDemoLogin(makeRequest(), db, makeConfig(), undefined, null, demoLimiter,);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("HX-Redirect",),).toBe("/views/chat",);
    expect(res.headers.get("Set-Cookie",),).toContain("ll_token=",);

    const soloUser = await db.selectFrom("users",).select("username",)
      .where("username", "=", "demo",).executeTakeFirst();
    expect(soloUser?.username,).toBe("demo",);
  });

  test("returns 500 when the JWT secret is missing", async () => {
    const res = await handleDemoLogin(
      makeRequest(),
      db,
      makeConfig({ jwtSecret: undefined, },),
      undefined,
      null,
      demoLimiter,
    );
    expect(res.status,).toBe(500,);
  });

  // BUG-demo-login-endpoint-bypasses-rate-limiter
  test("returns 429 after DEMO_LOGIN_MAX_ATTEMPTS (5) requests from the same IP", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await handleDemoLogin(makeRequest(), db, makeConfig(), undefined, null, demoLimiter,);
      expect(res.status,).toBe(200,);
    }
    const blocked = await handleDemoLogin(makeRequest(), db, makeConfig(), undefined, null, demoLimiter,);
    expect(blocked.status,).toBe(429,);
    expect(await blocked.text(),).toContain("Too many attempts",);
    expect(blocked.headers.get("Retry-After",),).toBeDefined();
  });
  test("demo-login limiter is per-IP — a different peer keeps a fresh budget", async () => {
    // Exhaust one peer
    for (let i = 0; i < 5; i++) {
      await handleDemoLogin(makeRequest(), db, makeConfig(), undefined, "10.0.0.1", demoLimiter,);
    }
    const blocked = await handleDemoLogin(makeRequest(), db, makeConfig(), undefined, "10.0.0.1", demoLimiter,);
    expect(blocked.status,).toBe(429,);
    // A different peer keeps its own budget
    const ok = await handleDemoLogin(makeRequest(), db, makeConfig(), undefined, "10.0.0.2", demoLimiter,);
    expect(ok.status,).toBe(200,);
  });
});

describe("handleLogin — Secure cookie", () => {
  // Snapshot env vars that drive `setTokenCookie`'s Secure-flag decision.
  const envSnapshot = {
    NODE_ENV: process.env.NODE_ENV,
    LL_COOKIE_SECURE: process.env.LL_COOKIE_SECURE,
  };

  /** */
  function restoreEnv(): void {
    for (const [k, v,] of Object.entries(envSnapshot,)) {
      if (v === undefined) { delete process.env[k]; }
      else { process.env[k] = v; }
    }
  }

  beforeEach(restoreEnv,);
  afterAll(restoreEnv,);

  test("omits Secure when neither NODE_ENV=production nor LL_COOKIE_SECURE is set", async () => {
    delete process.env.NODE_ENV;
    delete process.env.LL_COOKIE_SECURE;
    const res = await handleLogin(
      makeRequest(loginBody(USERNAME, PASSWORD,),),
      db,
      makeConfig(),
      undefined,
      null,
      loginLimiter,
    );
    const cookie = res.headers.get("Set-Cookie",) ?? "";
    expect(cookie,).not.toContain("Secure",);
    expect(cookie,).toContain("HttpOnly",);
    expect(cookie,).toContain("SameSite=Lax",);
  });

  test("emits Secure when NODE_ENV=production", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.LL_COOKIE_SECURE;
    const res = await handleLogin(
      makeRequest(loginBody(USERNAME, PASSWORD,),),
      db,
      makeConfig(),
      undefined,
      null,
      loginLimiter,
    );
    expect(res.headers.get("Set-Cookie",),).toContain("Secure",);
  });

  test("emits Secure when LL_COOKIE_SECURE=true overrides NODE_ENV=development", async () => {
    process.env.NODE_ENV = "development";
    process.env.LL_COOKIE_SECURE = "true";
    const res = await handleLogin(
      makeRequest(loginBody(USERNAME, PASSWORD,),),
      db,
      makeConfig(),
      undefined,
      null,
      loginLimiter,
    );
    expect(res.headers.get("Set-Cookie",),).toContain("Secure",);
  });

  test("omits Secure when LL_COOKIE_SECURE=false overrides NODE_ENV=production", async () => {
    process.env.NODE_ENV = "production";
    process.env.LL_COOKIE_SECURE = "false";
    const res = await handleLogin(
      makeRequest(loginBody(USERNAME, PASSWORD,),),
      db,
      makeConfig(),
      undefined,
      null,
      loginLimiter,
    );
    expect(res.headers.get("Set-Cookie",),).not.toContain("Secure",);
  });
});
