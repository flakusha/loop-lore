// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression tests for src/routes/auth/session.ts (handleMe, handleLogout).
 *
 * Covers the hardening introduced for security tickets:
 *   - handleMe MUST NOT trust an unverified JWT payload from the cookie.
 *     Previously it fell back to a base64-decode of `sub` from `ll_token`,
 *     allowing any attacker who could set a forged cookie to impersonate
 *     a chosen user. Now: only the signature-verified `derivedUserId` from
 *     the auth middleware is trusted; missing it returns 401.
 *   - handleLogout MUST verify the JWT before deleting the session row.
 *     Previously it parsed `sid` from an unverified cookie, so a forged
 *     token + known sid was a logout DoS. Now: only delete when both
 *     derivedUserId and derivedSessionId come from the verified middleware,
 *     and the WHERE clause pins the row to that userId (no cross-user wipe).
 */

import { beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { verifyJwt, } from "../../auth/jwt";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { handleListSessions, handleLogout, handleMe, handleRevokeSession, handleSwitchSession, } from "./session";
import { TOKEN_COOKIE, } from "./shared";

let db: Kysely<DB>;

beforeEach(async () => {
  ({ db, } = await createTestDb());
  await insertUsers(db, "Alice", "alice", { id: "user-alice", } as never,);
  await insertUsers(db, "Mallory", "mallory", { id: "user-mallory", } as never,);
},);

/**
 * @param cookieValue
 */
function makeRequestWithCookie(cookieValue: string,): Request {
  return new Request("http://localhost/api/auth/me", {
    headers: { Cookie: `${TOKEN_COOKIE}=${cookieValue}`, },
  },);
}

// Build a token with the same wire format as signJwt but with an arbitrary
// `sub` claim and NO signature — the attacker's forgery attempt.
/**
 * @param sub
 */
function forgeTokenWithSub(sub: string,): string {
  const headerB64 = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT", },),).toString("base64url",);
  const payloadB64 = Buffer.from(JSON.stringify({
    sub,
    role: "admin",
    sid: "any-session",
    iat: 0,
    exp: Math.floor(Date.now() / 1000,) + 3600,
  },),).toString("base64url",);
  // Arbitrary signature — must NOT be accepted by verifyJwt.
  const sigB64 = Buffer.from("forged-signature",).toString("base64url",);
  return `${headerB64}.${payloadB64}.${sigB64}`;
}

describe("handleMe — forged-cookie impersonation (regression)", () => {
  test("returns 401 when the request carries a forged ll_token cookie (no derivedUserId)", async () => {
    // Attacker sets a cookie claiming sub=user-alice. Middleware never ran
    // (derivedUserId = null), so /me must refuse — not honor the cookie.
    const forged = forgeTokenWithSub("user-alice",);
    const res = await handleMe(makeRequestWithCookie(forged,), db, null,);
    expect(res.status,).toBe(401,);
  });

  test("returns 401 when derivedUserId is missing and there is no cookie either", async () => {
    const res = await handleMe(
      new Request("http://localhost/api/auth/me",),
      db,
      null,
    );
    expect(res.status,).toBe(401,);
  });

  test("returns the authenticated user when derivedUserId is present", async () => {
    const res = await handleMe(
      new Request("http://localhost/api/auth/me",),
      db,
      "user-alice",
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { id: string };
    expect(body.id,).toBe("user-alice",);
  });

  test("ignores the cookie even when a valid cookie AND derivedUserId disagree (cookie must not override)", async () => {
    // Both cookie and middleware provide a userId; middleware wins. Without
    // a signature check on the cookie the route should still treat only the
    // signature-verified derivedUserId as authoritative.
    const forged = forgeTokenWithSub("user-mallory",);
    const req = makeRequestWithCookie(forged,);
    const res = await handleMe(req, db, "user-alice",);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { id: string };
    expect(body.id,).toBe("user-alice",);
  });
});

describe("handleLogout — forged-cookie session deletion (regression)", () => {
  test("does NOT delete a session when derivedSessionId is null (forged cookie)", async () => {
    const sessionId = randomUUID();
    const futureExpires = new Date(Date.now() + 60_000,).toISOString();
    await db.insertInto("sessions",)
      .values({
        id: sessionId,
        user_id: "user-alice",
        token_hash: "irrelevant",
        ip: "127.0.0.1",
        user_agent: "session.test",
        expires_at: futureExpires,
        last_activity: new Date().toISOString(),
      },)
      .execute();

    const forged = forgeTokenWithSub("user-alice",);
    const res = await handleLogout(
      makeRequestWithCookie(forged,),
      db,
      null,
      null,
    );
    expect(res.status,).toBe(200,);

    // The real session must still exist — a forged cookie cannot delete it.
    const row = await db.selectFrom("sessions",).selectAll().where("id", "=", sessionId,).executeTakeFirst();
    expect(row,).toBeDefined();
    expect(row?.user_id,).toBe("user-alice",);
  });

  test("does NOT delete another user's session even if the caller passes another sid (must filter WHERE user_id = derivedUserId)", async () => {
    // Mallory owns a session — Alice's logout must not be able to wipe it.
    const futureExpires = new Date(Date.now() + 60_000,).toISOString();
    const mallorySessionId = randomUUID();
    await db.insertInto("sessions",)
      .values({
        id: mallorySessionId,
        user_id: "user-mallory",
        token_hash: "y",
        ip: "127.0.0.1",
        user_agent: "session.test",
        expires_at: futureExpires,
        last_activity: new Date().toISOString(),
      },)
      .execute();

    // Caller claims to be user-alice with sid=mallorySessionId — they must
    // NOT be able to delete Mallory's session even with a verified auth path.
    const res = await handleLogout(
      new Request("http://localhost/api/auth/logout",),
      db,
      "user-alice",
      mallorySessionId,
    );
    expect(res.status,).toBe(200,);

    const mallorySession = await db.selectFrom("sessions",).selectAll().where("id", "=", mallorySessionId,)
      .executeTakeFirst();
    expect(mallorySession,).toBeDefined();
  });

  test("deletes the user's own session when derivedUserId + derivedSessionId both match", async () => {
    const futureExpires = new Date(Date.now() + 60_000,).toISOString();
    const sessionId = randomUUID();
    await db.insertInto("sessions",)
      .values({
        id: sessionId,
        user_id: "user-alice",
        token_hash: "x",
        ip: "127.0.0.1",
        user_agent: "session.test",
        expires_at: futureExpires,
        last_activity: new Date().toISOString(),
      },)
      .execute();

    const res = await handleLogout(
      new Request("http://localhost/api/auth/logout",),
      db,
      "user-alice",
      sessionId,
    );
    expect(res.status,).toBe(200,);

    const row = await db.selectFrom("sessions",).selectAll().where("id", "=", sessionId,).executeTakeFirst();
    expect(row,).toBeUndefined();
  });
});

// ── TASK-sessions-api-routes ────────────────────────────────────

const JWT_SECRET = "test-jwt-secret";

/** */
function makeConfig(): Config {
  return {
    auth: {
      required: true,
      registrationOpen: true,
      sessionTimeoutHours: 24,
      maxSessionsPerUser: 10,
      demoUsername: "demo",
      demoAutoSetup: false,
      jwtSecret: JWT_SECRET,
      jwtExpiresIn: 86_400,
    },
    encryption: { enabled: false, },
  } as unknown as Config;
}

/** */
interface SessionSeed {
  id: string;
  userId: string;
  lastActivityOffsetMs: number;
  expired?: boolean;
}

/**
 * @param seeds
 */
async function seedSessions(seeds: SessionSeed[],): Promise<void> {
  const now = Date.now();
  await db.insertInto("sessions",)
    .values(seeds.map((s,) => ({
      id: s.id,
      user_id: s.userId,
      token_hash: `jwt:${s.id}`,
      ip: "127.0.0.1",
      user_agent: `ua-${s.id}`,
      created_at: new Date(now - 60_000,).toISOString(),
      last_activity: new Date(now + s.lastActivityOffsetMs,).toISOString(),
      expires_at: new Date(now + (s.expired ? -60_000 : 3_600_000),).toISOString(),
    })),)
    .execute();
}

/**
 * @param res
 */
function getCookieToken(res: Response,): string | null {
  const header = res.headers.get("Set-Cookie",);
  const pair = header?.split(";",)?.at(0,);
  if (!pair?.startsWith(`${TOKEN_COOKIE}=`,)) { return null; }
  return pair.slice(TOKEN_COOKIE.length + 1,);
}

describe("handleListSessions", () => {
  test("returns own sessions ordered by last_activity desc, metadata only, current flagged", async () => {
    await seedSessions([
      { id: "sess-old", userId: "user-alice", lastActivityOffsetMs: -30_000, },
      { id: "sess-new", userId: "user-alice", lastActivityOffsetMs: -10_000, },
      { id: "sess-current", userId: "user-alice", lastActivityOffsetMs: 0, },
      { id: "sess-mallory", userId: "user-mallory", lastActivityOffsetMs: 0, },
    ],);
    const res = await handleListSessions(
      new Request("http://localhost/api/sessions",),
      db,
      "user-alice",
      "sess-current",
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { sessions: Record<string, unknown>[] };
    expect(body.sessions.map((s,) => s["id"]),).toEqual(["sess-current", "sess-new", "sess-old",],);
    for (const s of body.sessions) {
      expect(Object.keys(s,).sort(),).toEqual(
        ["created_at", "current", "expires_at", "id", "ip", "last_activity", "user_agent",],
      );
      expect(s,).not.toHaveProperty("token_hash",);
    }
    expect(body.sessions.map((s,) => s["current"]),).toEqual([true, false, false,],);
  });

  test("returns 401 without derivedUserId", async () => {
    const res = await handleListSessions(new Request("http://localhost/api/sessions",), db, null, null,);
    expect(res.status,).toBe(401,);
  });
});

describe("handleRevokeSession", () => {
  test("deletes the caller's own session", async () => {
    await seedSessions([
      { id: "sess-current", userId: "user-alice", lastActivityOffsetMs: 0, },
      { id: "sess-spare", userId: "user-alice", lastActivityOffsetMs: -10_000, },
    ],);
    const res = await handleRevokeSession(
      new Request("http://localhost/api/sessions/sess-spare", { method: "DELETE", },),
      db,
      "user-alice",
      "sess-current",
      "sess-spare",
    );
    expect(res.status,).toBe(200,);
    const gone = await db.selectFrom("sessions",).selectAll().where("id", "=", "sess-spare",).executeTakeFirst();
    expect(gone,).toBeUndefined();
    const current = await db.selectFrom("sessions",).selectAll().where("id", "=", "sess-current",).executeTakeFirst();
    expect(current,).toBeDefined();
  });

  test("returns 404 for another user's session and leaves it intact", async () => {
    await seedSessions([
      { id: "sess-current", userId: "user-alice", lastActivityOffsetMs: 0, },
      { id: "sess-mallory", userId: "user-mallory", lastActivityOffsetMs: 0, },
    ],);
    const res = await handleRevokeSession(
      new Request("http://localhost/api/sessions/sess-mallory", { method: "DELETE", },),
      db,
      "user-alice",
      "sess-current",
      "sess-mallory",
    );
    expect(res.status,).toBe(404,);
    const row = await db.selectFrom("sessions",).selectAll().where("id", "=", "sess-mallory",).executeTakeFirst();
    expect(row,).toBeDefined();
  });

  test("returns 400 when revoking the current session", async () => {
    await seedSessions([{ id: "sess-current", userId: "user-alice", lastActivityOffsetMs: 0, },],);
    const res = await handleRevokeSession(
      new Request("http://localhost/api/sessions/sess-current", { method: "DELETE", },),
      db,
      "user-alice",
      "sess-current",
      "sess-current",
    );
    expect(res.status,).toBe(400,);
    const row = await db.selectFrom("sessions",).selectAll().where("id", "=", "sess-current",).executeTakeFirst();
    expect(row,).toBeDefined();
  });

  test("returns 401 without derivedUserId", async () => {
    const res = await handleRevokeSession(
      new Request("http://localhost/api/sessions/x", { method: "DELETE", },),
      db,
      null,
      null,
      "x",
    );
    expect(res.status,).toBe(401,);
  });
});

describe("handleSwitchSession", () => {
  test("rotates the cookie to the target session and touches last_activity", async () => {
    await seedSessions([
      { id: "sess-current", userId: "user-alice", lastActivityOffsetMs: 0, },
      { id: "sess-target", userId: "user-alice", lastActivityOffsetMs: -60_000, },
    ],);
    const before = await db.selectFrom("sessions",).selectAll().where("id", "=", "sess-target",)
      .executeTakeFirstOrThrow();
    const res = await handleSwitchSession(
      new Request("http://localhost/api/sessions/sess-target/switch", { method: "POST", },),
      db,
      makeConfig(),
      "user-alice",
      "sess-current",
      "sess-target",
    );
    expect(res.status,).toBe(200,);
    const token = getCookieToken(res,);
    expect(token,).not.toBeNull();
    const verified = await verifyJwt({ secret: JWT_SECRET, token: token!, },);
    expect(verified.valid,).toBe(true,);
    if (verified.valid) {
      expect(verified.payload.sub,).toBe("user-alice",);
      expect(verified.payload.sid,).toBe("sess-target",);
    }
    const after = await db.selectFrom("sessions",).selectAll().where("id", "=", "sess-target",)
      .executeTakeFirstOrThrow();
    expect(Date.parse(after.last_activity as string,),).toBeGreaterThan(Date.parse(before.last_activity as string,),);
  });

  test("returns 404 for another user's session", async () => {
    await seedSessions([
      { id: "sess-current", userId: "user-alice", lastActivityOffsetMs: 0, },
      { id: "sess-mallory", userId: "user-mallory", lastActivityOffsetMs: 0, },
    ],);
    const res = await handleSwitchSession(
      new Request("http://localhost/api/sessions/sess-mallory/switch", { method: "POST", },),
      db,
      makeConfig(),
      "user-alice",
      "sess-current",
      "sess-mallory",
    );
    expect(res.status,).toBe(404,);
    expect(getCookieToken(res,),).toBeNull();
  });

  test("returns 410 for an expired session and deletes the row", async () => {
    await seedSessions([
      { id: "sess-current", userId: "user-alice", lastActivityOffsetMs: 0, },
      { id: "sess-stale", userId: "user-alice", lastActivityOffsetMs: -60_000, expired: true, },
    ],);
    const res = await handleSwitchSession(
      new Request("http://localhost/api/sessions/sess-stale/switch", { method: "POST", },),
      db,
      makeConfig(),
      "user-alice",
      "sess-current",
      "sess-stale",
    );
    expect(res.status,).toBe(410,);
    const row = await db.selectFrom("sessions",).selectAll().where("id", "=", "sess-stale",).executeTakeFirst();
    expect(row,).toBeUndefined();
  });

  test("returns 401 without derivedUserId", async () => {
    const res = await handleSwitchSession(
      new Request("http://localhost/api/sessions/x/switch", { method: "POST", },),
      db,
      makeConfig(),
      null,
      null,
      "x",
    );
    expect(res.status,).toBe(401,);
  });
});
