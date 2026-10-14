// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for `authenticate()` — the token-vs-solo decision.
 *
 * Regression guards for two defects:
 *  - a PRESENTED-but-invalid token fell through to the solo/demo identity when
 *    `auth.required === false` (silent auth downgrade, B4);
 *  - a session row whose `expires_at` does not parse was treated as "never
 *    expires" — the legacy `Date.parse()`/NaN accident (B5).
 */
import type { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, it, spyOn, } from "bun:test";
import type { Kysely, } from "kysely";
import { signJwt, } from "../../auth/jwt";
import type { AuthConfig, } from "../../config/schema/auth";
import { UserRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { ErrorCode, } from "../../routes/http-utils";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertSessions, insertUsers, } from "../../test-utils/insert-helpers";
import { authenticate, } from "./authenticate";
import { resetSoloUserCache, } from "./solo-user";

const JWT_SECRET = "test-secret-must-be-at-least-32-chars-long-aaaa";
const OTHER_SECRET = "another-secret-must-be-at-least-32-chars!";

/** `required: false` is the app default — single-user local mode. */
const SOLO_CONFIG = {
  required: false,
  registrationOpen: false,
  sessionTimeoutHours: 24,
  maxSessionsPerUser: 5,
  demoUsername: "demo",
  demoAutoSetup: false,
  jwtSecret: JWT_SECRET,
  legacyOpaqueTokenFallback: false,
} as const satisfies AuthConfig;

/** Server misconfiguration: token presented, no secret to validate it with. */
const NO_SECRET_CONFIG = {
  ...SOLO_CONFIG,
  jwtSecret: "",
} as const satisfies AuthConfig;

function futureExpiry(): string {
  return new Date(Date.now() + 86_400_000,).toISOString();
}

describe("authenticate — presented-token handling", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeEach(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
  },);

  afterEach(async () => {
    resetSoloUserCache();
    await db.destroy();
  },);

  /** Bearer-header request carrying `token`, or a bare request when null. */
  function req(token: string | null,): Request {
    return new Request(
      "http://localhost/api/chats",
      token ? { headers: { Authorization: `Bearer ${token}`, }, } : {},
    );
  }

  /**
   * Seed an active user plus a session row, and sign a JWT for that session.
   * The session row goes through the shared `insertSessions` helper so these
   * tests break if the sessions schema changes shape.
   */
  async function seedSession(opts?: {
    expiresAt?: string;
    secret?: string;
    skipSession?: boolean;
  },): Promise<{ userId: string; token: string }> {
    const userId = await insertUsers(db, "alice", "Alice",);
    const sessionId = opts?.skipSession
      ? "revoked-session-id"
      : await insertSessions(db, userId, "token-hash", opts?.expiresAt ?? futureExpiry(),);

    const token = await signJwt({
      secret: opts?.secret ?? JWT_SECRET,
      userId,
      role: UserRole.User,
      sessionId,
      expiresInSeconds: 3600,
    },);

    return { userId, token, };
  }

  /** The result is a 401 error body carrying no success signal. */
  async function expectUnauthorized(
    result: Response | { context: { userId?: string | null } },
  ): Promise<void> {
    expect(result instanceof Response,).toBe(true,);
    if (!(result instanceof Response)) { throw new Error("expected a 401 Response",); }
    expect(result.status,).toBe(401,);
    const body = await result.json() as { error?: string; code?: string };
    expect(body.code,).toBe(ErrorCode.Unauthorized,);
    expect(body.error ?? "",).not.toMatch(/success|authenticated|ok\b/i,);
  }

  it("no token + !required → solo context (single-user local mode)", async () => {
    const result = await authenticate({ request: req(null,), database: db, authConfig: SOLO_CONFIG, },);
    expect("context" in result,).toBe(true,);
    if (!("context" in result)) { throw new Error("expected context",); }
    expect(result.context.userRole,).toBe(UserRole.Solo,);
    expect(result.context.userId,).toBeDefined();
    expect(result.context.sessionId,).toBeNull();
  });

  it("expired token + !required → 401, never the solo identity", async () => {
    await seedSession();

    const expired = await signJwt({
      secret: JWT_SECRET,
      userId: "alice",
      role: UserRole.User,
      sessionId: "revoked-session-id",
      expiresInSeconds: -3600,
    },);

    await expectUnauthorized(await authenticate({ request: req(expired,), database: db, authConfig: SOLO_CONFIG, },),);
  });

  it("bad-signature token + !required → 401, never the solo identity", async () => {
    const { token, } = await seedSession({ secret: OTHER_SECRET, },);
    await expectUnauthorized(await authenticate({ request: req(token,), database: db, authConfig: SOLO_CONFIG, },),);
  });

  it("token whose session was deleted → 401, never the solo identity", async () => {
    const { token, } = await seedSession({ skipSession: true, },);
    await expectUnauthorized(await authenticate({ request: req(token,), database: db, authConfig: SOLO_CONFIG, },),);
  });

  it("token presented with no jwtSecret → solo context + warn, token never logged", async () => {
    const { token, } = await seedSession();
    const written: string[] = [];
    const spy = spyOn(process.stderr, "write",).mockImplementation((chunk: unknown,) => {
      written.push(String(chunk,),);
      return true;
    },);

    try {
      const result = await authenticate({ request: req(token,), database: db, authConfig: NO_SECRET_CONFIG, },);
      expect("context" in result,).toBe(true,);
      if (!("context" in result)) { throw new Error("expected context",); }
      expect(result.context.userRole,).toBe(UserRole.Solo,);

      // The module's cached child logger owns its own async queue, so poll
      // stderr until its 100ms flush lands rather than flushing the root.
      for (let i = 0; i < 50 && !written.join("",).includes("JWT secret not configured",); i++) {
        await Bun.sleep(20,);
      }

      expect(written.join("",),).toContain("JWT secret not configured",);
      // A token is a credential — its value must never reach the log.
      expect(written.join("",),).not.toContain(token,);
    } finally {
      spy.mockRestore();
    }
  });

  it("valid unexpired token → authenticates as that user, not solo", async () => {
    const { userId, token, } = await seedSession();
    const result = await authenticate({ request: req(token,), database: db, authConfig: SOLO_CONFIG, },);
    expect("context" in result,).toBe(true,);
    if (!("context" in result)) { throw new Error("expected context",); }
    expect(result.context.userId,).toBe(userId,);
    expect(result.context.userRole,).toBe(UserRole.User,);
  });

  it("unparseable expires_at on the session row → auth fails, not solo and not valid", async () => {
    // `sessions.expires_at` is NOT NULL, so a corrupt value is the only way to
    // reach the null branch of parseExpiryMs() — the same branch a NULL row took.
    const { token, } = await seedSession({ expiresAt: "not-a-date", },);
    await expectUnauthorized(await authenticate({ request: req(token,), database: db, authConfig: SOLO_CONFIG, },),);
  });

  it("sessions.expires_at rejects NULL — no live session can depend on a null expiry", async () => {
    const userId = await insertUsers(db, "bob", "Bob",);
    // Sanity: the same insert with a real value succeeds, so the rejection below
    // is the NOT NULL constraint and not some other insert error.
    await expect(insertSessions(db, userId, "hash", futureExpiry(),),).resolves.toBeTypeOf("string",);
    expect(() =>
      sqlite
        .query(`INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, NULL)`,)
        .run("null-expiry", userId, "hash",)
    ).toThrow(/NOT NULL/,);
  });
});
