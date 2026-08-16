/**
 * Tests for routes/auth/login.ts — handleLogin / handleDemoLogin
 *
 * Uses a real in-memory DB with real password hashing and JWT signing.
 * Verifies credential validation, account status gating, session
 * creation, cookie issuance, and rate limiting.
 */
/* eslint-disable sonarjs/no-hardcoded-passwords -- the password is a test fixture */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { handleDemoLogin, handleLogin, } from "./login";
import { resetLoginRateLimiter, } from "./shared";

let db: Kysely<DB>;
type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let sqlite: TestDb["sqlite"];
let passwordHash: string;

const USERNAME = "alice";
const PASSWORD = "correct-horse-battery";
const USER_ID = "user-login-alice";

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

function makeRequest(body?: string, headers?: Record<string, string>,): Request {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers, },
    body,
  },);
}

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
  resetLoginRateLimiter();
  return seedUsers();
},);

afterAll(async () => {
  db.destroy();
},);

describe("handleLogin — credential validation", () => {
  test("returns error HTML when username or password is missing", async () => {
    const res = await handleLogin(makeRequest(loginBody("", "x",),), db, makeConfig(),);
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
    const res = await handleLogin(req, db, makeConfig(),);
    expect(res.status,).toBe(400,);
  });

  test("returns invalid credentials for unknown user", async () => {
    const res = await handleLogin(makeRequest(loginBody("nobody", "x",),), db, makeConfig(),);
    const body = await res.text();
    expect(body,).toContain("Invalid username or password",);
  });

  test("returns account locked for disabled users", async () => {
    const res = await handleLogin(
      makeRequest(loginBody("disabled-user", PASSWORD,),),
      db,
      makeConfig(),
    );
    expect(await res.text(),).toContain("Account is disabled",);
  });

  test("returns invalid credentials for wrong password", async () => {
    const res = await handleLogin(makeRequest(loginBody(USERNAME, "wrong-password",),), db, makeConfig(),);
    expect(await res.text(),).toContain("Invalid username or password",);
  });
});

describe("handleLogin — success", () => {
  test("creates a session, returns HX-Redirect and auth cookie", async () => {
    const res = await handleLogin(makeRequest(loginBody(USERNAME, PASSWORD,),), db, makeConfig(),);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("HX-Redirect",),).toBe("/views/chat",);
    const cookie = res.headers.get("Set-Cookie",);
    expect(cookie,).toContain("ll_token=",);
    expect(cookie,).toContain("HttpOnly",);
    expect(cookie,).toContain("SameSite=Lax",);

    const session = await db.selectFrom("sessions",).select(["user_id", "ip",],).executeTakeFirst();
    expect(session?.user_id,).toBe(USER_ID,);
  });
});

describe("handleLogin — rate limiting", () => {
  test("returns 429 after 10 attempts", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await handleLogin(makeRequest(loginBody(USERNAME, "wrong",),), db, makeConfig(),);
      expect(res.status,).toBe(200,);
    }
    const blocked = await handleLogin(makeRequest(loginBody(USERNAME, "wrong",),), db, makeConfig(),);
    expect(blocked.status,).toBe(429,);
    expect(await blocked.text(),).toContain("Too many attempts",);
  });
});

describe("handleDemoLogin", () => {
  test("creates the solo user and returns a session cookie", async () => {
    const res = await handleDemoLogin(makeRequest(), db, makeConfig(),);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("HX-Redirect",),).toBe("/views/chat",);
    expect(res.headers.get("Set-Cookie",),).toContain("ll_token=",);

    const soloUser = await db.selectFrom("users",).select("username",)
      .where("username", "=", "demo",).executeTakeFirst();
    expect(soloUser?.username,).toBe("demo",);
  });

  test("returns 500 when the JWT secret is missing", async () => {
    const res = await handleDemoLogin(makeRequest(), db, makeConfig({ jwtSecret: undefined, },),);
    expect(res.status,).toBe(500,);
  });
});
