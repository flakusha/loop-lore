// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * MFA challenge issue route tests (1.0.0 MFA code-channel-first).
 * Pure: the clock is injected, delivery runs through in-memory fakes —
 * no SMTP, no bot token, no timers, no network.
 * Resource contract (parallel-safe): each test owns a FRESH in-memory
 * SQLite DB (`createTestDb` in beforeEach, `destroyTestDb` in afterEach);
 * no ordering dependence; no shared limiter or timer state.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { MFA_MESSENGER_BOT_TOKEN_KEY, } from "../../auth/channels/messenger";
import { verifyChallenge, } from "../../auth/factors/challenge";
import { ChallengePurpose, FactorKind, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { AdapterMessage, ProtocolAdapter, } from "../../integrations/adapter";
import { createMessageBridge, } from "../../integrations/bridge";
import { createEmailAdapter, type EmailTransportMessage, } from "../../integrations/email/adapter";
import { createBridgeRegistry, } from "../../integrations/registry";
import { createRateLimiter, } from "../../middleware/rate-limit";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertAuthFactors, insertUsers, } from "../../test-utils/insert-helpers";
import { handleIssueChallenge, MFA_ISSUE_PERMISSION, } from "./challenge";

/** Fixed epoch-ms start of the injected clock. */
const T0 = 1_700_000_000_000;

/** Enrolled destinations seeded on each factor. */
const EMAIL_TARGET = "user@example.com";
const MESSENGER_TARGET = "@user:matrix.org";
const MESSENGER_TOKEN = "test-messenger-token";

let fixture: TestDb | undefined;
let db: Kysely<DB>;
let clock: number;

/** The injected clock every service call runs on. */
const now = (): number => clock;

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

/** A user owning one e-mail factor and one messenger factor. */
async function seedFactors(): Promise<{
  userId: string;
  emailFactorId: string;
  messengerFactorId: string;
  sessionId: string;
}> {
  const userId = await insertUsers(db, "mfa-user", "MFA User",);
  const emailFactorId = await insertAuthFactors(db, userId, FactorKind.Email, clock, {
    target: EMAIL_TARGET,
    verified_at: clock,
  },);

  const messengerFactorId = await insertAuthFactors(db, userId, FactorKind.MessengerMatrix, clock, {
    target: MESSENGER_TARGET,
    verified_at: clock,
  },);

  // Legacy plain-text row: openConfigValue passes it through without SMK.
  await db.insertInto("system_config",).values({
    key: MFA_MESSENGER_BOT_TOKEN_KEY,
    value: MESSENGER_TOKEN,
    description: null,
  },).execute();

  return { userId, emailFactorId, messengerFactorId, sessionId: `sess-${userId}`, };
}

/** Build a connected bridge over a fake email transport capturing outbound mail. */
async function fakeEmailBridge(
  sent: EmailTransportMessage[],
  failSend = false,
): Promise<ReturnType<typeof createMessageBridge>> {
  const adapter = createEmailAdapter({
    transport: {
      send: async (message,) => {
        if (failSend) { throw new Error("smtp down",); }
        sent.push(message,);
        return "<mfa@test.example>";
      },
    },
  },);

  await adapter.connect({ smtpUser: "bot@loop.example", },);
  const registry = createBridgeRegistry();
  const registered = registry.register(adapter,);
  if (!registered.ok) { throw new Error("fake adapter registration failed",); }
  return createMessageBridge(registry,);
}

/** Build a connected bridge over a fake messenger adapter capturing outbound DMs. */
async function fakeMessengerBridge(
  sent: AdapterMessage[],
): Promise<ReturnType<typeof createMessageBridge>> {
  const adapter: ProtocolAdapter = {
    name: "fake-messenger",
    protocol: "matrix",
    connect: async () => {},
    disconnect: async () => {},
    isConnected: () => true,
    isEncrypted: () => false,
    capabilities: () => ["auth-challenge",],
    ownsTarget: (target,) => target.startsWith("@",),
    sendMessage: async (target, message,) => {
      sent.push({ id: "fake-id", target, ...message, },);
      return "fake-id";
    },
    onMessage: () => {},
  };

  await adapter.connect({},);
  const registry = createBridgeRegistry();
  const registered = registry.register(adapter,);
  if (!registered.ok) { throw new Error("fake adapter registration failed",); }
  return createMessageBridge(registry, { tokenBindings: { [MESSENGER_TOKEN]: "fake-messenger", }, },);
}

/** A bridge that owns no target — every send misses. */
async function emptyBridge(): Promise<ReturnType<typeof createMessageBridge>> {
  return createMessageBridge(createBridgeRegistry(),);
}

/** Extract the delivered code from a captured mail body. */
function codeFrom(body: string,): string {
  const match = /code is: (\S+)/.exec(body,);
  if (!match?.[1]) { throw new Error("no code in delivered body",); }
  return match[1];
}

describe("POST /api/v1/auth/factors/challenge", () => {
  test("email happy path — 200 carries id + expiry, code verifies, response holds no code", async () => {
    const { userId, emailFactorId, sessionId, } = await seedFactors();
    const sent: EmailTransportMessage[] = [];
    const bridge = await fakeEmailBridge(sent,);

    const res = await handleIssueChallenge({
      database: db,
      bridge,
      userId,
      sessionId,
      userRole: "user",
      factorId: emailFactorId,
      channel: "email",
      destination: "user@example.com",
      purpose: ChallengePurpose.Login,
      emailLimiter: createRateLimiter({ windowMs: 60_000, maxRequests: 1, },),
      now,
    },);

    expect(res.status,).toBe(200,);
    const body = await res.json() as { challengeId: string; expiresAt: number };
    expect(typeof body.challengeId,).toBe("string",);
    expect(body.expiresAt,).toBe(T0 + 10 * 60 * 1000,);
    expect(sent,).toHaveLength(1,);

    const code = codeFrom(sent[0]?.body ?? "",);
    expect(JSON.stringify(body,),).not.toContain(code,);

    const verified = await verifyChallenge({
      database: db,
      challengeId: body.challengeId,
      userId,
      code,
      purpose: ChallengePurpose.Login,
      now,
    },);

    expect(verified.ok,).toBe(true,);
  });

  test("messenger happy path — code reaches the handle and verifies", async () => {
    const { userId, messengerFactorId, sessionId, } = await seedFactors();
    const sent: AdapterMessage[] = [];
    const bridge = await fakeMessengerBridge(sent,);

    const res = await handleIssueChallenge({
      database: db,
      bridge,
      userId,
      sessionId,
      userRole: "user",
      factorId: messengerFactorId,
      channel: "messenger",
      destination: "@user:matrix.org",
      purpose: ChallengePurpose.Login,
      messengerLimiter: createRateLimiter({ windowMs: 60_000, maxRequests: 1, },),
      now,
    },);

    expect(res.status,).toBe(200,);
    const body = await res.json() as { challengeId: string; expiresAt: number };
    expect(sent,).toHaveLength(1,);
    expect(sent[0]?.target,).toBe("@user:matrix.org",);

    const verified = await verifyChallenge({
      database: db,
      challengeId: body.challengeId,
      userId,
      code: codeFrom(sent[0]?.body ?? "",),
      purpose: ChallengePurpose.Login,
      now,
    },);

    expect(verified.ok,).toBe(true,);
  });

  test("unknown, foreign, and channel-mismatched factors share one 404", async () => {
    const { userId, emailFactorId, sessionId, } = await seedFactors();
    const otherId = await insertUsers(db, "other", "Other",);
    const sent: EmailTransportMessage[] = [];
    const bridge = await fakeEmailBridge(sent,);
    const limiter = (): ReturnType<typeof createRateLimiter> =>
      createRateLimiter({ windowMs: 60_000, maxRequests: 1, },);

    const bodies: string[] = [];
    for (const factorId of ["no-such-factor", emailFactorId,]) {
      const res = await handleIssueChallenge({
        database: db,
        bridge,
        // The second probe runs as the other user: the factor is foreign.
        userId: factorId === emailFactorId ? otherId : userId,
        sessionId: "sess-probe",
        userRole: "user",
        factorId,
        channel: "email",
        destination: "user@example.com",
        purpose: ChallengePurpose.Login,
        emailLimiter: limiter(),
        now,
      },);

      expect(res.status,).toBe(404,);
      bodies.push(await res.text(),);
    }

    // Channel mismatch: an email factor is not a messenger factor.
    const mismatched = await handleIssueChallenge({
      database: db,
      bridge,
      userId,
      sessionId,
      userRole: "user",
      factorId: emailFactorId,
      channel: "messenger",
      destination: "@user:matrix.org",
      purpose: ChallengePurpose.Login,
      messengerLimiter: limiter(),
      now,
    },);

    expect(mismatched.status,).toBe(404,);
    bodies.push(await mismatched.text(),);

    expect(bodies[0],).toBe(bodies[1],);
    expect(bodies[1],).toBe(bodies[2],);
    expect(sent,).toHaveLength(0,);
  });

  test("rate-limited resend — second issue within the window is 429 and sends nothing", async () => {
    const { userId, emailFactorId, sessionId, } = await seedFactors();
    const sent: EmailTransportMessage[] = [];
    const bridge = await fakeEmailBridge(sent,);
    const emailLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1, },);
    const issue = (): Promise<Response> =>
      handleIssueChallenge({
        database: db,
        bridge,
        userId,
        sessionId,
        userRole: "user",
        factorId: emailFactorId,
        channel: "email",
        destination: "user@example.com",
        purpose: ChallengePurpose.Login,
        emailLimiter,
        now,
      },);

    expect((await issue()).status,).toBe(200,);
    expect((await issue()).status,).toBe(429,);
    expect(sent,).toHaveLength(1,);
  });

  test("delivery failure — 502 with a generic body carrying no code or target", async () => {
    const { userId, emailFactorId, sessionId, } = await seedFactors();
    const sent: EmailTransportMessage[] = [];
    const bridge = await fakeEmailBridge(sent, true,);

    const res = await handleIssueChallenge({
      database: db,
      bridge,
      userId,
      sessionId,
      userRole: "user",
      factorId: emailFactorId,
      channel: "email",
      destination: "user@example.com",
      purpose: ChallengePurpose.Login,
      emailLimiter: createRateLimiter({ windowMs: 60_000, maxRequests: 1, },),
      now,
    },);

    expect(res.status,).toBe(502,);
    const text = await res.text();
    expect(text,).not.toContain("user@example.com",);
    expect(text,).not.toContain("smtp",);
  });

  test("unconfigured transport — no bridge is 503, unknown target is 502", async () => {
    const { userId, emailFactorId, sessionId, } = await seedFactors();

    const missing = await handleIssueChallenge({
      database: db,
      bridge: undefined,
      userId,
      sessionId,
      userRole: "user",
      factorId: emailFactorId,
      channel: "email",
      destination: "user@example.com",
      purpose: ChallengePurpose.Login,
      emailLimiter: createRateLimiter({ windowMs: 60_000, maxRequests: 1, },),
      now,
    },);

    expect(missing.status,).toBe(503,);

    const unowned = await handleIssueChallenge({
      database: db,
      bridge: await emptyBridge(),
      userId,
      sessionId,
      userRole: "user",
      factorId: emailFactorId,
      channel: "email",
      destination: "user@example.com",
      purpose: ChallengePurpose.Login,
      emailLimiter: createRateLimiter({ windowMs: 60_000, maxRequests: 1, },),
      now,
    },);

    expect(unowned.status,).toBe(502,);
  });

  test("unauthenticated — no session identity is 401; gated role is 403", async () => {
    const { userId, emailFactorId, } = await seedFactors();
    const sent: EmailTransportMessage[] = [];
    const bridge = await fakeEmailBridge(sent,);

    const anon = await handleIssueChallenge({
      database: db,
      bridge,
      userId: null,
      sessionId: null,
      userRole: null,
      factorId: emailFactorId,
      channel: "email",
      destination: "user@example.com",
      purpose: ChallengePurpose.Login,
      now,
    },);

    expect(anon.status,).toBe(401,);

    const gated = await handleIssueChallenge({
      database: db,
      bridge,
      userId,
      sessionId: "sess-x",
      userRole: "custom",
      factorId: emailFactorId,
      channel: "email",
      destination: "user@example.com",
      purpose: ChallengePurpose.Login,
      now,
    },);

    expect(gated.status,).toBe(403,);
    expect(sent,).toHaveLength(0,);
  });

  test("issue permission — the gate value is chat.join and the custom role is refused", async () => {
    expect(MFA_ISSUE_PERMISSION,).toBe("chat.join",);

    const { userId, emailFactorId, sessionId, } = await seedFactors();
    const sent: EmailTransportMessage[] = [];
    const bridge = await fakeEmailBridge(sent,);

    const res = await handleIssueChallenge({
      database: db,
      bridge,
      userId,
      sessionId,
      userRole: "custom",
      factorId: emailFactorId,
      channel: "email",
      destination: "user@example.com",
      purpose: ChallengePurpose.Login,
      now,
    },);

    expect(res.status,).toBe(403,);
    expect(sent,).toHaveLength(0,);
  });

  test("invalid destination — non-email to the email channel is 400", async () => {
    const { userId, emailFactorId, sessionId, } = await seedFactors();
    const sent: EmailTransportMessage[] = [];
    const bridge = await fakeEmailBridge(sent,);

    const res = await handleIssueChallenge({
      database: db,
      bridge,
      userId,
      sessionId,
      userRole: "user",
      factorId: emailFactorId,
      channel: "email",
      destination: "not-an-address",
      purpose: ChallengePurpose.Login,
      now,
    },);

    expect(res.status,).toBe(400,);
    expect(sent,).toHaveLength(0,);
  });

  test("destination mismatch — a third-party address is refused with the unknown-factor 404", async () => {
    const { userId, emailFactorId, messengerFactorId, sessionId, } = await seedFactors();
    const sent: EmailTransportMessage[] = [];
    const dmSent: AdapterMessage[] = [];
    const emailBridge = await fakeEmailBridge(sent,);
    const messengerBridge = await fakeMessengerBridge(dmSent,);
    const limiter = (): ReturnType<typeof createRateLimiter> =>
      createRateLimiter({ windowMs: 60_000, maxRequests: 1, },);

    const unknown = await handleIssueChallenge({
      database: db,
      bridge: emailBridge,
      userId,
      sessionId,
      userRole: "user",
      factorId: "no-such-factor",
      channel: "email",
      destination: EMAIL_TARGET,
      purpose: ChallengePurpose.Login,
      emailLimiter: limiter(),
      now,
    },);

    for (
      const [factorId, channel, destination,] of [
        [emailFactorId, "email", "attacker@example.com",],
        [messengerFactorId, "messenger", "@attacker:matrix.org",],
      ] as const
    ) {
      const res = await handleIssueChallenge({
        database: db,
        bridge: channel === "email" ? emailBridge : messengerBridge,
        userId,
        sessionId,
        userRole: "user",
        factorId,
        channel,
        destination,
        purpose: ChallengePurpose.Login,
        emailLimiter: limiter(),
        messengerLimiter: limiter(),
        now,
      },);

      expect(res.status,).toBe(404,);
      const text = await res.text();
      expect(text,).toBe(await unknown.clone().text(),);
      expect(text,).not.toContain(destination,);
    }

    expect(sent,).toHaveLength(0,);
    expect(dmSent,).toHaveLength(0,);
  });

  test("destination normalization — case and whitespace do not block the enrolled target", async () => {
    const { userId, emailFactorId, messengerFactorId, sessionId, } = await seedFactors();
    const sent: EmailTransportMessage[] = [];
    const dmSent: AdapterMessage[] = [];

    const email = await handleIssueChallenge({
      database: db,
      bridge: await fakeEmailBridge(sent,),
      userId,
      sessionId,
      userRole: "user",
      factorId: emailFactorId,
      channel: "email",
      destination: `  ${EMAIL_TARGET.toUpperCase()}  `,
      purpose: ChallengePurpose.Login,
      emailLimiter: createRateLimiter({ windowMs: 60_000, maxRequests: 1, },),
      now,
    },);

    expect(email.status,).toBe(200,);

    const messenger = await handleIssueChallenge({
      database: db,
      bridge: await fakeMessengerBridge(dmSent,),
      userId,
      sessionId,
      userRole: "user",
      factorId: messengerFactorId,
      channel: "messenger",
      destination: ` ${MESSENGER_TARGET.toUpperCase()} `,
      purpose: ChallengePurpose.Login,
      messengerLimiter: createRateLimiter({ windowMs: 60_000, maxRequests: 1, },),
      now,
    },);

    expect(messenger.status,).toBe(200,);
  });

  test("unverified factor — login issue is 404, enroll issue delivers to the stored target", async () => {
    const userId = await insertUsers(db, "mfa-user", "MFA User",);
    const factorId = await insertAuthFactors(db, userId, FactorKind.Email, clock, {
      target: EMAIL_TARGET,
      verified_at: null,
    },);

    const sent: EmailTransportMessage[] = [];
    const bridge = await fakeEmailBridge(sent,);
    const sessionId = `sess-${userId}`;

    const login = await handleIssueChallenge({
      database: db,
      bridge,
      userId,
      sessionId,
      userRole: "user",
      factorId,
      channel: "email",
      destination: EMAIL_TARGET,
      purpose: ChallengePurpose.Login,
      emailLimiter: createRateLimiter({ windowMs: 60_000, maxRequests: 2, },),
      now,
    },);

    expect(login.status,).toBe(404,);
    expect(sent,).toHaveLength(0,);

    const enroll = await handleIssueChallenge({
      database: db,
      bridge,
      userId,
      sessionId,
      userRole: "user",
      factorId,
      channel: "email",
      destination: ` ${EMAIL_TARGET.toUpperCase()} `,
      purpose: ChallengePurpose.Enroll,
      emailLimiter: createRateLimiter({ windowMs: 60_000, maxRequests: 2, },),
      now,
    },);

    expect(enroll.status,).toBe(200,);
    expect(sent,).toHaveLength(1,);
    expect(sent[0]?.to,).toBe(EMAIL_TARGET,);
  });
});
