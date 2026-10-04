// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for token extraction + user-id resolution (JWT and legacy paths).
 *
 * Every resolveUserIdFromRequest call passes an explicit authConfig fixture
 * (DI): other test files mock `config/load` process-globally, so the no-DI
 * loadConfig() path is untestable in a shared process — see auth.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import crypto from "node:crypto";
import { signJwt, } from "../../auth/jwt";
import type { AuthConfig, } from "../../config/schema/auth";
import { UserStatus, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { uid, } from "../../utils";
import { DOMAIN_INFO, domainKey, } from "../../utils/hkdf";
import { getOrCreateSoloUserForAuth, resetSoloUserCache, } from "./solo-user";
import { extractBearerToken, resolveUserIdFromRequest, } from "./token";

const JWT_SECRET = "test-secret-must-be-at-least-32-chars-long-aaaa";
const OTHER_SECRET = "another-secret-must-be-at-least-32-chars!";

const BASE_CONFIG = {
  required: false,
  registrationOpen: false,
  sessionTimeoutHours: 24,
  maxSessionsPerUser: 5,
  demoUsername: "demo",
  demoAutoSetup: false,
} as const;

/** Legacy sha256(token) fallback only — no JWT branch. */
const LEGACY_ONLY_CONFIG = {
  ...BASE_CONFIG,
  jwtSecret: "",
  legacyOpaqueTokenFallback: true,
} as const satisfies AuthConfig;

/** JWT branch only — legacy fallback off. */
const JWT_CONFIG = {
  ...BASE_CONFIG,
  jwtSecret: JWT_SECRET,
  legacyOpaqueTokenFallback: false,
} as const satisfies AuthConfig;

/** Both branches enabled — JWT wins when both match. */
const JWT_PLUS_LEGACY_CONFIG = {
  ...BASE_CONFIG,
  jwtSecret: JWT_SECRET,
  legacyOpaqueTokenFallback: true,
} as const satisfies AuthConfig;

function sha256Hex(token: string,): string {
  return crypto.createHash("sha256",).update(token,).digest("hex",);
}

function futureExpiry(): string {
  return new Date(Date.now() + 86_400_000,).toISOString();
}

function pastExpiry(): string {
  return new Date(Date.now() - 86_400_000,).toISOString();
}

function requestWithCookie(cookie: string | null,): Request {
  return new Request("http://localhost", cookie ? { headers: { Cookie: cookie, }, } : {},);
}

async function insertUser(db: Kysely<DB>, id: string, status: UserStatus,): Promise<void> {
  await db.insertInto("users",).values({
    id,
    username: `user-${id}`,
    display_name: "Test User",
    role: "user",
    status,
    settings: "{}",
  },).execute();
}

async function insertSession(
  db: Kysely<DB>,
  id: string,
  userId: string,
  tokenHash: string,
  expiresAt: string,
): Promise<void> {
  await db.insertInto("sessions",).values({
    id,
    user_id: userId,
    token_hash: tokenHash,
    ip: "127.0.0.1",
    user_agent: "test",
    expires_at: expiresAt,
  },).execute();
}

function base64urlEncode(value: string,): string {
  const bytes = new TextEncoder().encode(value,);
  return btoa(String.fromCharCode(...bytes,),).replaceAll("+", "-",).replaceAll("/", "_",).replace(/=+$/, "",);
}

/** Sign an arbitrary header/payload with the same key derivation as signJwt. */
async function signRaw(headerB64: string, payloadB64: string, secret: string,): Promise<string> {
  const encoder = new TextEncoder();
  const subkey = await domainKey(secret, DOMAIN_INFO.JWT_SIGNING, 32,);
  const key = await crypto.subtle.importKey(
    "raw",
    subkey as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256", },
    false,
    ["sign",],
  );

  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`${headerB64}.${payloadB64}`,),);
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig,),),).replaceAll("+", "-",).replaceAll("/", "_",)
    .replace(
      /=+$/,
      "",
    );

  return `${headerB64}.${payloadB64}.${sigB64}`;
}

async function tokenWithPayload(payloadJson: string, secret: string = JWT_SECRET,): Promise<string> {
  return signRaw(
    base64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT", },),),
    base64urlEncode(payloadJson,),
    secret,
  );
}

describe("extractBearerToken — edge shapes", () => {
  it("returns null for 'Bearer' without a space", () => {
    const req = new Request("http://localhost", { headers: { Authorization: "Bearer", }, },);
    expect(extractBearerToken(req,),).toBeNull();
  });

  it("returns null for a lowercase scheme", () => {
    const req = new Request("http://localhost", { headers: { Authorization: "bearer abc", }, },);
    expect(extractBearerToken(req,),).toBeNull();
  });

  it("keeps internal whitespace in the token", () => {
    const req = new Request("http://localhost", { headers: { Authorization: "Bearer abc def", }, },);
    expect(extractBearerToken(req,),).toBe("abc def",);
  });
});

describe("resolveUserIdFromRequest — JWT session path", () => {
  let db: Kysely<DB>;
  let sqlite: TestDb["sqlite"];

  beforeEach(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
  },);

  afterEach(async () => {
    resetSoloUserCache();
    await db.destroy();
  },);

  /** Assert the token is rejected and the resolver falls back to the solo user. */
  async function expectSoloForToken(token: string,): Promise<void> {
    const solo = await getOrCreateSoloUserForAuth(db, "demo",);
    expect(solo?.id ?? null,).not.toBeNull();
    const resolved = await resolveUserIdFromRequest(requestWithCookie(`ll_token=${token}`,), db, "demo", JWT_CONFIG,);
    expect(resolved,).toBe(solo?.id ?? null,);
  }

  it("resolves the session user for a valid JWT", async () => {
    const userId = uid();
    await insertUser(db, userId, UserStatus.Active,);
    const sid = uid();
    await insertSession(db, sid, userId, "jwt:" + sid, futureExpiry(),);
    const token = await signJwt({ secret: JWT_SECRET, userId, role: "user", sessionId: sid, expiresInSeconds: 3600, },);
    const resolved = await resolveUserIdFromRequest(requestWithCookie(`ll_token=${token}`,), db, "demo", JWT_CONFIG,);
    expect(resolved,).toBe(userId,);
  });

  it("prefers the JWT session over a legacy session for the same token", async () => {
    const jwtUserId = uid();
    const legacyUserId = uid();
    await insertUser(db, jwtUserId, UserStatus.Active,);
    await insertUser(db, legacyUserId, UserStatus.Active,);
    const sid = uid();
    const token = await signJwt({
      secret: JWT_SECRET,
      userId: jwtUserId,
      role: "user",
      sessionId: sid,
      expiresInSeconds: 3600,
    },);

    await insertSession(db, sid, jwtUserId, "jwt:" + sid, futureExpiry(),);
    await insertSession(db, "legacy-sid", legacyUserId, sha256Hex(token,), futureExpiry(),);
    const resolved = await resolveUserIdFromRequest(
      requestWithCookie(`ll_token=${token}`,),
      db,
      "demo",
      JWT_PLUS_LEGACY_CONFIG,
    );

    expect(resolved,).toBe(jwtUserId,);
  });

  it("falls through to the legacy lookup when the JWT names an unknown session", async () => {
    const userId = uid();
    await insertUser(db, userId, UserStatus.Active,);
    const sid = uid();
    const token = await signJwt({ secret: JWT_SECRET, userId, role: "user", sessionId: sid, expiresInSeconds: 3600, },);
    // No session row for sid — but a legacy sha256(token) row exists.
    await insertSession(db, "legacy-sid", userId, sha256Hex(token,), futureExpiry(),);
    const resolved = await resolveUserIdFromRequest(
      requestWithCookie(`ll_token=${token}`,),
      db,
      "demo",
      JWT_PLUS_LEGACY_CONFIG,
    );

    expect(resolved,).toBe(userId,);
  });

  it("falls through when the JWT session is expired", async () => {
    const userId = uid();
    await insertUser(db, userId, UserStatus.Active,);
    const sid = uid();
    const token = await signJwt({ secret: JWT_SECRET, userId, role: "user", sessionId: sid, expiresInSeconds: 3600, },);
    await insertSession(db, sid, userId, "jwt:" + sid, pastExpiry(),);
    await insertSession(db, "legacy-sid", userId, sha256Hex(token,), futureExpiry(),);
    const resolved = await resolveUserIdFromRequest(
      requestWithCookie(`ll_token=${token}`,),
      db,
      "demo",
      JWT_PLUS_LEGACY_CONFIG,
    );

    expect(resolved,).toBe(userId,);
  });

  it("falls through when the JWT session expiry is an unparseable date", async () => {
    const userId = uid();
    await insertUser(db, userId, UserStatus.Active,);
    const sid = uid();
    const token = await signJwt({ secret: JWT_SECRET, userId, role: "user", sessionId: sid, expiresInSeconds: 3600, },);
    await insertSession(db, sid, userId, "jwt:" + sid, "not-a-date",);
    await insertSession(db, "legacy-sid", userId, sha256Hex(token,), futureExpiry(),);
    const resolved = await resolveUserIdFromRequest(
      requestWithCookie(`ll_token=${token}`,),
      db,
      "demo",
      JWT_PLUS_LEGACY_CONFIG,
    );

    expect(resolved,).toBe(userId,);
  });

  it("falls back to solo when the JWT-resolved user is Disabled", async () => {
    const userId = uid();
    await insertUser(db, userId, UserStatus.Disabled,);
    const sid = uid();
    await insertSession(db, sid, userId, "jwt:" + sid, futureExpiry(),);
    const token = await signJwt({ secret: JWT_SECRET, userId, role: "user", sessionId: sid, expiresInSeconds: 3600, },);
    const solo = await getOrCreateSoloUserForAuth(db, "demo",);
    expect(solo?.id ?? null,).not.toBe(userId,);
    expect(await resolveUserIdFromRequest(requestWithCookie(`ll_token=${token}`,), db, "demo", JWT_CONFIG,),).toBe(
      solo?.id ?? null,
    );
  });

  it("falls back to solo when the JWT-resolved user is Deactivated", async () => {
    const userId = uid();
    await insertUser(db, userId, UserStatus.Deactivated,);
    const sid = uid();
    await insertSession(db, sid, userId, "jwt:" + sid, futureExpiry(),);
    const token = await signJwt({ secret: JWT_SECRET, userId, role: "user", sessionId: sid, expiresInSeconds: 3600, },);
    const solo = await getOrCreateSoloUserForAuth(db, "demo",);
    expect(await resolveUserIdFromRequest(requestWithCookie(`ll_token=${token}`,), db, "demo", JWT_CONFIG,),).toBe(
      solo?.id ?? null,
    );
  });

  it("falls back to solo when the JWT session's user row is gone", async () => {
    const sid = uid();
    // Insert the session with FK enforcement off: the referenced user does not exist.
    sqlite.run("PRAGMA foreign_keys = OFF",);
    await insertSession(db, sid, "ghost-user", "jwt:" + sid, futureExpiry(),);
    sqlite.run("PRAGMA foreign_keys = ON",);
    const token = await signJwt({
      secret: JWT_SECRET,
      userId: "ghost-user",
      role: "user",
      sessionId: sid,
      expiresInSeconds: 3600,
    },);

    const solo = await getOrCreateSoloUserForAuth(db, "demo",);
    expect(await resolveUserIdFromRequest(requestWithCookie(`ll_token=${token}`,), db, "demo", JWT_CONFIG,),).toBe(
      solo?.id ?? null,
    );
  });

  it("rejects an expired JWT (exp in the past)", async () => {
    const token = await signJwt({
      secret: JWT_SECRET,
      userId: "u",
      role: "user",
      sessionId: "s",
      expiresInSeconds: -3600,
    },);

    await expectSoloForToken(token,);
  });

  it("rejects a JWT whose exp equals the current time (boundary)", async () => {
    const token = await signJwt({
      secret: JWT_SECRET,
      userId: "u",
      role: "user",
      sessionId: "s",
      expiresInSeconds: 0,
    },);

    await expectSoloForToken(token,);
  });

  it("rejects a JWT signed with the wrong secret", async () => {
    const token = await signJwt({
      secret: OTHER_SECRET,
      userId: "u",
      role: "user",
      sessionId: "s",
      expiresInSeconds: 3600,
    },);

    await expectSoloForToken(token,);
  });

  it("rejects a token without three dot-separated parts", async () => {
    await expectSoloForToken("payload.sig",);
  });

  it("rejects a token with four dot-separated parts", async () => {
    await expectSoloForToken("a.b.c.d",);
  });

  it("rejects a token with an invalid base64url signature", async () => {
    await expectSoloForToken("aaa.bbb.!!!",);
  });

  it("rejects a JWT missing the sid claim", async () => {
    const token = await tokenWithPayload(
      JSON.stringify({ sub: "u", role: "user", exp: Math.floor(Date.now() / 1000,) + 3600, },),
    );

    await expectSoloForToken(token,);
  });

  it("rejects a JWT missing the exp claim", async () => {
    const token = await tokenWithPayload(JSON.stringify({ sub: "u", role: "user", sid: "s", },),);
    await expectSoloForToken(token,);
  });

  it("rejects a JWT with a non-JSON payload", async () => {
    const token = await tokenWithPayload("not-json!",);
    await expectSoloForToken(token,);
  });

  it("rejects a JWT with an array payload", async () => {
    const token = await tokenWithPayload("[1,2,3]",);
    await expectSoloForToken(token,);
  });
});

describe("resolveUserIdFromRequest — legacy session edges", () => {
  let db: Kysely<DB>;

  beforeEach(async () => {
    createLogger({ level: "warn", },);
    ({ db, } = await createTestDb());
  },);

  afterEach(async () => {
    resetSoloUserCache();
    await db.destroy();
  },);

  it("falls back to solo when the session expiry is an unparseable date", async () => {
    const userId = uid();
    await insertUser(db, userId, UserStatus.Active,);
    const token = "legacy-token";
    await insertSession(db, "s1", userId, sha256Hex(token,), "not-a-date",);
    const solo = await getOrCreateSoloUserForAuth(db, "demo",);
    expect(await resolveUserIdFromRequest(requestWithCookie(`ll_token=${token}`,), db, "demo", LEGACY_ONLY_CONFIG,),)
      .toBe(solo?.id ?? null,);
  });

  it("falls back to solo when the session is expired", async () => {
    const userId = uid();
    await insertUser(db, userId, UserStatus.Active,);
    const token = "expired-legacy-token";
    await insertSession(db, "s1", userId, sha256Hex(token,), pastExpiry(),);
    const solo = await getOrCreateSoloUserForAuth(db, "demo",);
    expect(await resolveUserIdFromRequest(requestWithCookie(`ll_token=${token}`,), db, "demo", LEGACY_ONLY_CONFIG,),)
      .toBe(solo?.id ?? null,);
  });

  it("falls back to solo when the cookie header has no ll_token", async () => {
    const solo = await getOrCreateSoloUserForAuth(db, "demo",);
    expect(await resolveUserIdFromRequest(requestWithCookie("theme=dark",), db, "demo", LEGACY_ONLY_CONFIG,),).toBe(
      solo?.id ?? null,
    );
  });

  it("falls back to solo when ll_token is empty", async () => {
    const solo = await getOrCreateSoloUserForAuth(db, "demo",);
    expect(await resolveUserIdFromRequest(requestWithCookie("ll_token=",), db, "demo", LEGACY_ONLY_CONFIG,),).toBe(
      solo?.id ?? null,
    );
  });

  it("uses the first ll_token when the cookie repeats it", async () => {
    const firstId = uid();
    const secondId = uid();
    await insertUser(db, firstId, UserStatus.Active,);
    await insertUser(db, secondId, UserStatus.Active,);
    await insertSession(db, "s1", firstId, sha256Hex("first",), futureExpiry(),);
    await insertSession(db, "s2", secondId, sha256Hex("second",), futureExpiry(),);
    const resolved = await resolveUserIdFromRequest(
      requestWithCookie("ll_token=first; ll_token=second",),
      db,
      "demo",
      LEGACY_ONLY_CONFIG,
    );

    expect(resolved,).toBe(firstId,);
  });
});
