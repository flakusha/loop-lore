// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * MFA messenger channel unit tests (1.0.0 MFA code-channel-first).
 * Pure: the clock is injected, delivery runs through an in-memory fake
 * messenger adapter — no bot token, no timers, no network.
 * Resource contract (parallel-safe): each test owns a FRESH in-memory
 * SQLite DB (`createTestDb` in beforeEach, `destroyTestDb` in afterEach);
 * no ordering dependence; no shared limiter or timer state.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { getConfigValue, } from "../../admin/config";
import { initSmk, } from "../../crypto/smk";
import { ChallengePurpose, FactorKind, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { AdapterMessage, ProtocolAdapter, } from "../../integrations/adapter";
import { createMessageBridge, } from "../../integrations/bridge";
import { createBridgeRegistry, } from "../../integrations/registry";
import { createRateLimiter, } from "../../middleware/rate-limit";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertAuthFactors, insertUsers, } from "../../test-utils/insert-helpers";
import { verifyChallenge, } from "../factors/challenge";
import { verifyPassword, } from "../password";
import {
  createMfaMessengerLimiter,
  MFA_MESSENGER_BOT_TOKEN_KEY,
  MFA_MESSENGER_DEFAULT_SENDER,
  MFA_MESSENGER_DEFAULT_WINDOW_MS,
  MFA_MESSENGER_RATE_LIMIT_WINDOW_MS_KEY,
  MFA_MESSENGER_SENDER_KEY,
  readMfaMessengerBotToken,
  readMfaMessengerSender,
  readMfaMessengerWindowMs,
  saveMfaMessengerBotToken,
  saveMfaMessengerSender,
  saveMfaMessengerWindowMs,
  sendMfaMessenger,
} from "./messenger";

/** Fixed epoch-ms start of the injected clock. */
const T0 = 1_700_000_000_000;

let fixture: TestDb | undefined;
let db: Kysely<DB>;
let clock: number;

/** The injected clock every service call runs on. */
const now = (): number => clock;

/** Install an active SMK so the bot-token envelope has key material. */
beforeAll(async () => {
  await initSmk({
    serverEncryptionKey: "f".repeat(64,),
    required: false,
    compressThreshold: 1024,
    compressAlgorithm: "gzip",
  },);
},);

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

afterAll(async () => {
  // Reset the process-global SMK so later suites do not inherit an active key.
  await initSmk({ required: false, compressThreshold: 1024, compressAlgorithm: "gzip", },);
},);

/** A user owning one messenger factor. */
async function seedFactor(): Promise<{ userId: string; factorId: string }> {
  const userId = await insertUsers(db, "mfa-user", "MFA User",);
  const factorId = await insertAuthFactors(db, userId, FactorKind.MessengerMatrix, clock,);
  return { userId, factorId, };
}

/** Build a connected bridge over a fake messenger adapter capturing outbound DMs. */
async function fakeBridge(
  sent: AdapterMessage[],
  failSend = false,
): Promise<ReturnType<typeof createMessageBridge>> {
  const adapter: ProtocolAdapter = {
    name: "fake-messenger",
    protocol: "matrix",
    connect: async () => {},
    disconnect: async () => {},
    isConnected: () => true,
    isEncrypted: () => false,
    capabilities: () => ["auth-challenge",],
    ownsTarget: (target,) => !target.includes("@",) || target.startsWith("@",),
    sendMessage: async (target, message,) => {
      if (failSend) { throw new Error("bot down",); }
      sent.push({ id: "fake-id", target, ...message, },);
      return "fake-id";
    },
    onMessage: () => {},
  };

  await adapter.connect({},);
  const registry = createBridgeRegistry();
  const registered = registry.register(adapter,);
  if (!registered.ok) { throw new Error("fake adapter registration failed",); }
  return createMessageBridge(registry,);
}

describe("the MFA messenger channel", () => {
  test("code-sent path — verifyChallenge accepts the delivered code", async () => {
    const { userId, factorId, } = await seedFactor();
    const sent: AdapterMessage[] = [];
    const bridge = await fakeBridge(sent,);

    const result = await sendMfaMessenger({
      database: db,
      bridge,
      userId,
      factorId,
      purpose: ChallengePurpose.Login,
      toHandle: "@user:matrix.org",
      limiter: createRateLimiter({ windowMs: 60_000, maxRequests: 1, },),
      now,
    },);

    if (!result.ok) { throw new Error(`send failed: ${result.error.code}`,); }

    expect(sent,).toHaveLength(1,);
    expect(sent[0]?.target,).toBe("@user:matrix.org",);
    expect(sent[0]?.body,).toContain(result.value.code,);

    const verified = await verifyChallenge({
      database: db,
      challengeId: result.value.id,
      userId,
      code: result.value.code,
      purpose: ChallengePurpose.Login,
      now,
    },);

    expect(verified.ok,).toBe(true,);
  });

  test("rate-limit refusal — second send within the window returns rate_limited and sends nothing", async () => {
    const { userId, factorId, } = await seedFactor();
    const sent: AdapterMessage[] = [];
    const bridge = await fakeBridge(sent,);
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1, },);

    const first = await sendMfaMessenger({
      database: db,
      bridge,
      userId,
      factorId,
      purpose: ChallengePurpose.Login,
      toHandle: "@user:matrix.org",
      limiter,
      now,
    },);

    expect(first.ok,).toBe(true,);
    expect(sent,).toHaveLength(1,);

    const second = await sendMfaMessenger({
      database: db,
      bridge,
      userId,
      factorId,
      purpose: ChallengePurpose.Login,
      toHandle: "@user:matrix.org",
      limiter,
      now,
    },);

    expect(second.ok,).toBe(false,);
    if (second.ok) { throw new Error("second send should have been refused",); }
    expect(second.error.code,).toBe("rate_limited",);
    expect(sent,).toHaveLength(1,);
  });

  test("no-leak — the DB row holds an Argon2id hash only, and no code is logged", async () => {
    const { userId, factorId, } = await seedFactor();
    const sent: AdapterMessage[] = [];
    const bridge = await fakeBridge(sent,);

    const messages: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]): void => {
      messages.push(args.map(String,).join(" ",),);
    };

    try {
      const result = await sendMfaMessenger({
        database: db,
        bridge,
        userId,
        factorId,
        purpose: ChallengePurpose.Login,
        toHandle: "@user:matrix.org",
        limiter: createRateLimiter({ windowMs: 60_000, maxRequests: 1, },),
        now,
      },);

      if (!result.ok) { throw new Error(`send failed: ${result.error.code}`,); }

      const row = await db
        .selectFrom("auth_challenges",)
        .selectAll()
        .where("id", "=", result.value.id,)
        .executeTakeFirst();

      expect(row,).toBeDefined();
      // The stored hash verifies against the code, and the row text never
      // contains the plaintext code itself.
      expect(await verifyPassword(result.value.code, row?.nonce_hash ?? "",),).toBe(true,);
      expect(JSON.stringify(row,),).not.toContain(result.value.code,);
      expect(messages.join("\n",),).not.toContain(result.value.code,);
    } finally {
      console.log = originalLog;
    }
  });

  test("delivery failure — transport error maps to delivery_failed and the prior code still verifies", async () => {
    const { userId, factorId, } = await seedFactor();
    const delivered: AdapterMessage[] = [];
    const goodBridge = await fakeBridge(delivered,);

    const first = await sendMfaMessenger({
      database: db,
      bridge: goodBridge,
      userId,
      factorId,
      purpose: ChallengePurpose.Login,
      toHandle: "@user:matrix.org",
      limiter: createRateLimiter({ windowMs: 60_000, maxRequests: 1, },),
      now,
    },);

    if (!first.ok) { throw new Error(`first send failed: ${first.error.code}`,); }
    expect(delivered,).toHaveLength(1,);

    // Resend while the bot is down: the new code never arrives.
    const lost: AdapterMessage[] = [];
    const badBridge = await fakeBridge(lost, true,);
    const resend = await sendMfaMessenger({
      database: db,
      bridge: badBridge,
      userId,
      factorId,
      purpose: ChallengePurpose.Login,
      toHandle: "@user:matrix.org",
      limiter: createRateLimiter({ windowMs: 60_000, maxRequests: 1, },),
      now,
    },);

    expect(resend.ok,).toBe(false,);
    if (resend.ok) { throw new Error("resend should have failed",); }
    expect(resend.error.code,).toBe("delivery_failed",);
    expect(lost,).toHaveLength(0,);

    // The previously delivered code still verifies — the user is not stranded.
    const recovered = await verifyChallenge({
      database: db,
      challengeId: first.value.id,
      userId,
      code: first.value.code,
      purpose: ChallengePurpose.Login,
      now,
    },);

    expect(recovered.ok,).toBe(true,);
  });

  test("sender, bot token and window overrides round-trip through the admin helpers", async () => {
    expect(await readMfaMessengerSender({ database: db, },),).toBe(MFA_MESSENGER_DEFAULT_SENDER,);
    expect(await readMfaMessengerWindowMs({ database: db, },),).toBe(MFA_MESSENGER_DEFAULT_WINDOW_MS,);
    expect(await readMfaMessengerBotToken({ database: db, },),).toBeUndefined();

    await saveMfaMessengerSender({ database: db, sender: "  mfa-bot  ", },);
    expect(await readMfaMessengerSender({ database: db, },),).toBe("mfa-bot",);

    await saveMfaMessengerBotToken({ database: db, token: "  secret-bot-token  ", },);
    expect(await readMfaMessengerBotToken({ database: db, },),).toBe("secret-bot-token",);

    await saveMfaMessengerWindowMs({ database: db, windowMs: 30_000.7, },);
    expect(await readMfaMessengerWindowMs({ database: db, },),).toBe(30_000,);

    await expect(saveMfaMessengerSender({ database: db, sender: "   ", },),).rejects.toThrow();
    await expect(saveMfaMessengerBotToken({ database: db, token: "   ", },),).rejects.toThrow();
    await expect(saveMfaMessengerWindowMs({ database: db, windowMs: 0, },),).rejects.toThrow();
    await expect(saveMfaMessengerWindowMs({ database: db, windowMs: Number.NaN, },),).rejects.toThrow();
  });

  test("config keys map 1:1 to system_config slots", async () => {
    expect(MFA_MESSENGER_BOT_TOKEN_KEY,).toBe("integrations.messenger.mfa_bot_token",);
    expect(MFA_MESSENGER_SENDER_KEY,).toBe("integrations.messenger.mfa_sender",);
    expect(MFA_MESSENGER_RATE_LIMIT_WINDOW_MS_KEY,).toBe("integrations.messenger.mfa_rate_limit_window_ms",);

    await saveMfaMessengerSender({ database: db, sender: "key-probe-bot", },);
    await saveMfaMessengerBotToken({ database: db, token: "key-probe-token", },);
    await saveMfaMessengerWindowMs({ database: db, windowMs: 11_000, },);

    // Each helper persists under exactly its own key — no aliasing.
    expect(await getConfigValue(db, MFA_MESSENGER_SENDER_KEY,),).toBe("key-probe-bot",);
    expect(await getConfigValue(db, MFA_MESSENGER_BOT_TOKEN_KEY,),).toBe("key-probe-token",);
    expect(await getConfigValue(db, MFA_MESSENGER_RATE_LIMIT_WINDOW_MS_KEY,),).toBe("11000",);
  });

  test("createMfaMessengerLimiter resolves the stored window and caches per window", async () => {
    await saveMfaMessengerWindowMs({ database: db, windowMs: 5_000, },);

    const first = await createMfaMessengerLimiter({ database: db, },);
    expect(first.windowMs,).toBe(5_000,);
    expect((await createMfaMessengerLimiter({ database: db, },)).limiter,).toBe(first.limiter,);

    const explicit = await createMfaMessengerLimiter({ database: db, windowMs: 7_000, },);
    expect(explicit.windowMs,).toBe(7_000,);
    expect(explicit.limiter,).not.toBe(first.limiter,);
  });
});
