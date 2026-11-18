// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * MFA factor verify endpoint tests (epic-auth-channel-provisioning, slice 3).
 * Pure: the clock is injected, delivery runs through an in-memory email
 * adapter fake — no SMTP, no timers, no network.
 * Resource contract (parallel-safe): each test owns a FRESH in-memory
 * SQLite DB (`createTestDb` in beforeEach, `destroyTestDb` in afterEach);
 * no ordering dependence; no shared limiter or timer state.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { issueChallenge, } from "../../auth/factors/challenge";
import { verifyJwt, } from "../../auth/jwt";
import type { Config, } from "../../config/schema";
import { ChallengePurpose, FactorKind, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createRateLimiter, } from "../../middleware/rate-limit";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertAuthFactors, insertUsers, } from "../../test-utils/insert-helpers";
import { handleVerifyFactor, } from "./verify";

/** Fixed epoch-ms start of the injected clock. */
const T0 = 1_700_000_000_000;

const JWT_SECRET = "test-jwt-secret-must-be-at-least-32-chars";

let fixture: TestDb | undefined;
let db: Kysely<DB>;
let clock: number;

/** The injected clock every service call runs on. */
const now = (): number => clock;

/** Minimal config carrying the JWT secret for re-signing. */
function makeConfig(): Config {
  return {
    auth: { jwtSecret: JWT_SECRET, jwtExpiresIn: 86_400, },
  } as unknown as Config;
}

beforeEach(async () => {
  fixture = await createTestDb();
  db = fixture.db;
  clock = T0;
},);

afterEach(async () => {
  if (fixture) {
    await destroyTestDb(fixture,);
    fixture = undefined;
  }
},);

/** A user owning one e-mail factor, with a named session. */
async function seedSession(
  verified = true,
): Promise<{ userId: string; factorId: string; sessionId: string }> {
  const userId = await insertUsers(db, "mfa-user", "MFA User",);
  const factorId = await insertAuthFactors(db, userId, FactorKind.Email, clock, {
    verified_at: verified ? clock : null,
  },);

  const sessionId = `sess-${userId}`;
  await db.insertInto("sessions",).values({
    id: sessionId,
    user_id: userId,
    secret_hash: `jwt:${sessionId}`,
    ip: "127.0.0.1",
    user_agent: "test",
    expires_at: new Date(T0 + 86_400_000,).toISOString(),
  },).execute();

  return { userId, factorId, sessionId, };
}

/** Issue a login challenge and fail loudly when the issue failed. */
async function issueLoginChallenge(userId: string, factorId: string,) {
  const issued = await issueChallenge({
    database: db,
    userId,
    factorId,
    purpose: ChallengePurpose.Login,
    now,
  },);

  if (!issued.ok) { throw new Error(`issue failed: ${issued.error.code}`,); }
  return issued.value;
}

/** Read the JWT minted by a Set-Cookie header. */
async function tokenFrom(res: Response,): Promise<string> {
  const cookie = res.headers.get("Set-Cookie",) ?? "";
  const token = cookie.split(";",)[0]?.split("=",)[1] ?? "";
  if (!token) { throw new Error("no token cookie minted",); }
  return token;
}

describe("POST /api/v1/auth/factors/verify", () => {
  test("success path — claims present on the re-signed token", async () => {
    const { userId, factorId, sessionId, } = await seedSession();
    const issued = await issueLoginChallenge(userId, factorId,);

    const res = await handleVerifyFactor({
      database: db,
      config: makeConfig(),
      userId,
      sessionId,
      userRole: "user",
      challengeId: issued.id,
      code: issued.code,
      purpose: ChallengePurpose.Login,
      now,
    },);

    expect(res.status,).toBe(200,);
    const decoded = await verifyJwt({ secret: JWT_SECRET, token: await tokenFrom(res,), },);
    expect(decoded.valid,).toBe(true,);
    if (!decoded.valid) { throw new Error("minted token failed verification",); }
    expect(decoded.payload.amr,).toEqual(["mfa-email",],);
    expect(decoded.payload.auth_time,).toBe(Math.floor(T0 / 1000,),);
    expect(decoded.payload.sub,).toBe(userId,);
    expect(decoded.payload.sid,).toBe(sessionId,);
  });

  test("wrong code — 401 and the challenge stays open", async () => {
    const { userId, factorId, sessionId, } = await seedSession();
    const issued = await issueLoginChallenge(userId, factorId,);

    const res = await handleVerifyFactor({
      database: db,
      config: makeConfig(),
      userId,
      sessionId,
      userRole: "user",
      challengeId: issued.id,
      code: "000000",
      purpose: ChallengePurpose.Login,
      now,
    },);

    expect(res.status,).toBe(401,);
    const row = await db.selectFrom("auth_challenges",).select("consumed",).where("id", "=", issued.id,)
      .executeTakeFirst();

    expect(row?.consumed,).toBe(0,);
  });

  test("expired challenge — 410", async () => {
    const { userId, factorId, sessionId, } = await seedSession();
    const issued = await issueLoginChallenge(userId, factorId,);
    clock = T0 + 11 * 60 * 1000;

    const res = await handleVerifyFactor({
      database: db,
      config: makeConfig(),
      userId,
      sessionId,
      userRole: "user",
      challengeId: issued.id,
      code: issued.code,
      purpose: ChallengePurpose.Login,
      now,
    },);

    expect(res.status,).toBe(410,);
  });

  test("consumed challenge — second verify is 410", async () => {
    const { userId, factorId, sessionId, } = await seedSession();
    const issued = await issueLoginChallenge(userId, factorId,);
    const first = await handleVerifyFactor({
      database: db,
      config: makeConfig(),
      userId,
      sessionId,
      userRole: "user",
      challengeId: issued.id,
      code: issued.code,
      purpose: ChallengePurpose.Login,
      now,
    },);

    expect(first.status,).toBe(200,);

    const second = await handleVerifyFactor({
      database: db,
      config: makeConfig(),
      userId,
      sessionId,
      userRole: "user",
      challengeId: issued.id,
      code: issued.code,
      purpose: ChallengePurpose.Login,
      now,
    },);

    expect(second.status,).toBe(410,);
  });

  test("purpose mismatch — stepup challenge refused for login purpose", async () => {
    const { userId, factorId, sessionId, } = await seedSession();
    const issued = await issueChallenge({
      database: db,
      userId,
      factorId,
      purpose: ChallengePurpose.StepUp,
      now,
    },);

    if (!issued.ok) { throw new Error(`issue failed: ${issued.error.code}`,); }

    const res = await handleVerifyFactor({
      database: db,
      config: makeConfig(),
      userId,
      sessionId,
      userRole: "user",
      challengeId: issued.value.id,
      code: issued.value.code,
      purpose: ChallengePurpose.Login,
      now,
    },);

    expect(res.status,).toBe(404,);
  });

  test("unauthenticated — no session identity is 401", async () => {
    const { userId, factorId, } = await seedSession();
    const issued = await issueLoginChallenge(userId, factorId,);

    const res = await handleVerifyFactor({
      database: db,
      config: makeConfig(),
      userId: null,
      sessionId: null,
      userRole: null,
      challengeId: issued.id,
      code: issued.code,
      purpose: ChallengePurpose.Login,
      now,
    },);

    expect(res.status,).toBe(401,);
  });

  test("rate-limited verify — exhausted per-user budget is 429 and the challenge stays open", async () => {
    const { userId, factorId, sessionId, } = await seedSession();
    const issued = await issueLoginChallenge(userId, factorId,);
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1, },);

    const first = await handleVerifyFactor({
      database: db,
      config: makeConfig(),
      userId,
      sessionId,
      userRole: "user",
      challengeId: issued.id,
      code: "000000",
      purpose: ChallengePurpose.Login,
      limiter,
      now,
    },);

    expect(first.status,).toBe(401,);

    const second = await handleVerifyFactor({
      database: db,
      config: makeConfig(),
      userId,
      sessionId,
      userRole: "user",
      challengeId: issued.id,
      code: issued.code,
      purpose: ChallengePurpose.Login,
      limiter,
      now,
    },);

    expect(second.status,).toBe(429,);

    const row = await db.selectFrom("auth_challenges",).select("consumed",).where("id", "=", issued.id,)
      .executeTakeFirst();

    expect(row?.consumed,).toBe(0,);
  });

  test("unverified factor cannot verify a login challenge - 404 and challenge stays open", async () => {
    const { userId, factorId, sessionId, } = await seedSession(false,);
    const issued = await issueChallenge({
      database: db,
      userId,
      factorId,
      purpose: ChallengePurpose.Login,
      now,
    },);

    if (!issued.ok) { throw new Error(`issue failed: ${issued.error.code}`,); }

    const res = await handleVerifyFactor({
      database: db,
      config: makeConfig(),
      userId,
      sessionId,
      userRole: "user",
      challengeId: issued.value.id,
      code: issued.value.code,
      purpose: ChallengePurpose.Login,
      now,
    },);

    expect(res.status,).toBe(404,);

    const row = await db.selectFrom("auth_challenges",).select("consumed",).where("id", "=", issued.value.id,)
      .executeTakeFirst();

    expect(row?.consumed,).toBe(0,);
  });

  test("enroll challenge activates a factor without issuing a JWT", async () => {
    const { userId, factorId, sessionId, } = await seedSession(false,);
    const issued = await issueChallenge({
      database: db,
      userId,
      factorId,
      purpose: ChallengePurpose.Enroll,
      now,
    },);

    if (!issued.ok) { throw new Error(`issue failed: ${issued.error.code}`,); }

    const res = await handleVerifyFactor({
      database: db,
      config: makeConfig(),
      userId,
      sessionId,
      userRole: "user",
      challengeId: issued.value.id,
      code: issued.value.code,
      purpose: ChallengePurpose.Enroll,
      now,
    },);

    expect(res.status,).toBe(200,);
    expect(res.headers.get("set-cookie",),).toBeNull();

    const factor = await db.selectFrom("auth_factors",).select("verified_at",).where("id", "=", factorId,)
      .executeTakeFirst();

    expect(factor?.verified_at,).toBe(T0,);
  });
});
