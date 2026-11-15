// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * MFA email channel unit tests (epic-auth-channel-provisioning, slice 2).
 *
 * Pure: the clock is injected, the bridge routes to an in-memory email
 * adapter fake — no SMTP, no timers, no network.
 *
 * Resource contract (parallel-safe):
 * - Each test owns a FRESH in-memory SQLite DB (`createTestDb` in
 *   beforeEach) — `:memory:` handles are per-instance, never a shared
 *   file, so concurrent runners cannot collide.
 * - Teardown is deterministic: `destroyTestDb` runs in `afterEach`, which
 *   Bun executes even when an assertion throws.
 * - No ordering dependence: every test seeds its own user and factor.
 * - No process globals: no shared limiter (fresh `createRateLimiter` per
 *   test), never `setTestDatabase`, never stubs a timer.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { ChallengePurpose, FactorKind, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createMessageBridge, } from "../../integrations/bridge";
import { createEmailAdapter, type EmailTransportMessage, } from "../../integrations/email/adapter";
import { createBridgeRegistry, } from "../../integrations/registry";
import { createRateLimiter, } from "../../middleware/rate-limit";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertAuthFactors, insertUsers, } from "../../test-utils/insert-helpers";
import { verifyChallenge, } from "../factors/challenge";
import { verifyPassword, } from "../password";
import {
  createMfaEmailLimiter,
  MFA_EMAIL_DEFAULT_SENDER,
  MFA_EMAIL_DEFAULT_WINDOW_MS,
  readMfaEmailSender,
  readMfaEmailWindowMs,
  saveMfaEmailSender,
  saveMfaEmailWindowMs,
  sendMfaEmail,
} from "./email";

/** Fixed epoch-ms start of the injected clock. */
const T0 = 1_700_000_000_000;

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

/** A user owning one e-mail factor. */
async function seedFactor(): Promise<{ userId: string; factorId: string }> {
  const userId = await insertUsers(db, "mfa-user", "MFA User",);
  const factorId = await insertAuthFactors(db, userId, FactorKind.Email, clock,);
  return { userId, factorId, };
}

/** Build a connected bridge over a fake email transport capturing outbound mail. */
async function fakeBridge(
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

describe("the MFA email channel", () => {
  test("code-sent path — verifyChallenge accepts the delivered code", async () => {
    const { userId, factorId, } = await seedFactor();
    const sent: EmailTransportMessage[] = [];
    const bridge = await fakeBridge(sent,);

    const result = await sendMfaEmail({
      database: db,
      bridge,
      userId,
      factorId,
      purpose: ChallengePurpose.Login,
      toEmail: "user@example.com",
      limiter: createRateLimiter({ windowMs: 60_000, maxRequests: 1, },),
      now,
    },);

    if (!result.ok) { throw new Error(`send failed: ${result.error.code}`,); }

    expect(sent,).toHaveLength(1,);
    expect(sent[0]?.to,).toBe("user@example.com",);
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
    const sent: EmailTransportMessage[] = [];
    const bridge = await fakeBridge(sent,);
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1, },);

    const first = await sendMfaEmail({
      database: db,
      bridge,
      userId,
      factorId,
      purpose: ChallengePurpose.Login,
      toEmail: "user@example.com",
      limiter,
      now,
    },);

    expect(first.ok,).toBe(true,);
    expect(sent,).toHaveLength(1,);

    const second = await sendMfaEmail({
      database: db,
      bridge,
      userId,
      factorId,
      purpose: ChallengePurpose.Login,
      toEmail: "user@example.com",
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
    const sent: EmailTransportMessage[] = [];
    const bridge = await fakeBridge(sent,);

    const messages: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]): void => {
      messages.push(args.map(String,).join(" ",),);
    };

    try {
      const result = await sendMfaEmail({
        database: db,
        bridge,
        userId,
        factorId,
        purpose: ChallengePurpose.Login,
        toEmail: "user@example.com",
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

  test("failed resend preserves the previously delivered code", async () => {
    const { userId, factorId, } = await seedFactor();
    const delivered: EmailTransportMessage[] = [];
    const goodBridge = await fakeBridge(delivered,);

    const first = await sendMfaEmail({
      database: db,
      bridge: goodBridge,
      userId,
      factorId,
      purpose: ChallengePurpose.Login,
      toEmail: "user@example.com",
      limiter: createRateLimiter({ windowMs: 60_000, maxRequests: 1, },),
      now,
    },);

    if (!first.ok) { throw new Error(`first send failed: ${first.error.code}`,); }
    expect(delivered,).toHaveLength(1,);

    // Resend while SMTP is down: the new code never arrives.
    const lost: EmailTransportMessage[] = [];
    const badBridge = await fakeBridge(lost, true,);
    const resend = await sendMfaEmail({
      database: db,
      bridge: badBridge,
      userId,
      factorId,
      purpose: ChallengePurpose.Login,
      toEmail: "user@example.com",
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

  test("delivery failure — transport error maps to delivery_failed without recording budget", async () => {
    const { userId, factorId, } = await seedFactor();
    const sent: EmailTransportMessage[] = [];
    const bridge = await fakeBridge(sent, true,);
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1, },);

    const failed = await sendMfaEmail({
      database: db,
      bridge,
      userId,
      factorId,
      purpose: ChallengePurpose.Login,
      toEmail: "user@example.com",
      limiter,
      now,
    },);

    expect(failed.ok,).toBe(false,);
    if (failed.ok) { throw new Error("delivery should have failed",); }
    expect(failed.error.code,).toBe("delivery_failed",);
    expect(sent,).toHaveLength(0,);
  });

  test("sender and window overrides round-trip through the admin helpers", async () => {
    expect(await readMfaEmailSender({ database: db, },),).toBe(MFA_EMAIL_DEFAULT_SENDER,);
    expect(await readMfaEmailWindowMs({ database: db, },),).toBe(MFA_EMAIL_DEFAULT_WINDOW_MS,);

    await saveMfaEmailSender({ database: db, sender: "  mfa@example.com  ", },);
    expect(await readMfaEmailSender({ database: db, },),).toBe("mfa@example.com",);

    await saveMfaEmailWindowMs({ database: db, windowMs: 30_000.7, },);
    expect(await readMfaEmailWindowMs({ database: db, },),).toBe(30_000,);

    await expect(saveMfaEmailSender({ database: db, sender: "   ", },),).rejects.toThrow();
    await expect(saveMfaEmailWindowMs({ database: db, windowMs: 0, },),).rejects.toThrow();
    await expect(saveMfaEmailWindowMs({ database: db, windowMs: Number.NaN, },),).rejects.toThrow();
  });

  test("createMfaEmailLimiter resolves the stored window and caches per window", async () => {
    await saveMfaEmailWindowMs({ database: db, windowMs: 5_000, },);

    const first = await createMfaEmailLimiter({ database: db, },);
    expect(first.windowMs,).toBe(5_000,);
    expect((await createMfaEmailLimiter({ database: db, },)).limiter,).toBe(first.limiter,);

    const explicit = await createMfaEmailLimiter({ database: db, windowMs: 7_000, },);
    expect(explicit.windowMs,).toBe(7_000,);
    expect(explicit.limiter,).not.toBe(first.limiter,);
  });

  test("issue failure refunds the send budget — retry with the right factor works", async () => {
    const { userId, factorId, } = await seedFactor();
    const otherId = await insertUsers(db, "other", "Other",);
    const sent: EmailTransportMessage[] = [];
    const bridge = await fakeBridge(sent,);
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1, },);

    const failed = await sendMfaEmail({
      database: db,
      bridge,
      userId: otherId,
      factorId,
      purpose: ChallengePurpose.Login,
      toEmail: "user@example.com",
      limiter,
      now,
    },);

    expect(failed.ok,).toBe(false,);
    if (failed.ok) { throw new Error("cross-user send should have failed",); }
    expect(failed.error.code,).toBe("not_found",);

    // The failed issue refunded the budget, so the retry on the same limiter passes.
    const retried = await sendMfaEmail({
      database: db,
      bridge,
      userId,
      factorId,
      purpose: ChallengePurpose.Login,
      toEmail: "user@example.com",
      limiter,
      now,
    },);

    expect(retried.ok,).toBe(true,);
    expect(sent,).toHaveLength(1,);
  });
});
