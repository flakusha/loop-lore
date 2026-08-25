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
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { handleLogout, handleMe, } from "./session";
import { TOKEN_COOKIE, } from "./shared";

let db: Kysely<DB>;

beforeEach(async () => {
  ({ db, } = await createTestDb());
  await insertUsers(db, "Alice", "alice", { id: "user-alice", } as never,);
  await insertUsers(db, "Mallory", "mallory", { id: "user-mallory", } as never,);
},);

function makeRequestWithCookie(cookieValue: string,): Request {
  return new Request("http://localhost/api/auth/me", {
    headers: { Cookie: `${TOKEN_COOKIE}=${cookieValue}`, },
  },);
}

// Build a token with the same wire format as signJwt but with an arbitrary
// `sub` claim and NO signature — the attacker's forgery attempt.
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
