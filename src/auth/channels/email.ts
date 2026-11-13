// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * MFA email channel (epic-auth-channel-provisioning, slice 2 of 3).
 * Issues a challenge and delivers its code through the message bridge.
 * The code travels only in the result and the mail body — never logged.
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { getConfigValue, setConfig, } from "../../admin/config";
import type { ChallengePurpose, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { MessageBridge, } from "../../integrations/bridge";
import type { RateLimiter, } from "../../middleware/rate-limit";
import { createRateLimiter, } from "../../middleware/rate-limit";
import { issueChallenge, } from "../factors/challenge";
import type { ChallengeError, ChallengeResult, IssuedChallenge, } from "../factors/types";

/** `system_config` key holding the MFA sender address (admin-override layer). */
export const MFA_EMAIL_SENDER_KEY = "integrations.email.mfa_sender";

/** `system_config` key holding the MFA send rate-limit window in ms. */
export const MFA_EMAIL_RATE_LIMIT_WINDOW_MS_KEY = "integrations.email.mfa_rate_limit_window_ms";

/** Default MFA send window — one code per user per 60s. */
export const MFA_EMAIL_DEFAULT_WINDOW_MS = 60_000;

/** Default sender stamped on MFA mail when no sender is configured. */
export const MFA_EMAIL_DEFAULT_SENDER = "no-reply@loop-lore.local";

// Module-singleton limiter: each createRateLimiter() owns a Map + prune
// timer, so a fresh instance per send would never limit and would leak an
// interval per call. Cached by resolved window, like src/routes/auth/shared.ts.
let cached: { windowMs: number; limiter: RateLimiter } | undefined;

/** Build a per-user MFA send limiter from the stored window override.
 * @param options Database handle plus optional window override.
 * @returns The limiter and its resolved window. */
export async function createMfaEmailLimiter(
  options: { database: Kysely<DB>; windowMs?: number },
): Promise<{ limiter: RateLimiter; windowMs: number }> {
  const resolved = options.windowMs ?? await readMfaEmailWindowMs({ database: options.database, },);
  if (cached !== undefined && cached.windowMs === resolved) { return cached; }
  const fresh = { windowMs: resolved, limiter: createRateLimiter({ windowMs: resolved, maxRequests: 1, },), };
  cached = fresh;
  return fresh;
}

/** Effective MFA send window (stored override wins, default otherwise).
 * @param options Database handle.
 * @returns Window in ms. */
export async function readMfaEmailWindowMs(options: { database: Kysely<DB> },): Promise<number> {
  const raw = await getConfigValue(options.database, MFA_EMAIL_RATE_LIMIT_WINDOW_MS_KEY,);
  const parsed = raw === undefined ? Number.NaN : Number(raw,);
  if (Number.isFinite(parsed,) && parsed > 0) { return Math.floor(parsed,); }
  return MFA_EMAIL_DEFAULT_WINDOW_MS;
}

/** Effective MFA sender address (stored override wins, default otherwise).
 * @param options Database handle.
 * @returns Sender address. */
export async function readMfaEmailSender(options: { database: Kysely<DB> },): Promise<string> {
  const trimmed = (await getConfigValue(options.database, MFA_EMAIL_SENDER_KEY,))?.trim();
  if (trimmed) { return trimmed; }
  return MFA_EMAIL_DEFAULT_SENDER;
}

/** Persist an admin MFA sender override.
 * @param options Database handle plus sender address.
 * @throws {Error} When the sender address is empty.
 * @returns Resolves when stored. */
export async function saveMfaEmailSender(options: { database: Kysely<DB>; sender: string },): Promise<void> {
  const sender = options.sender.trim();
  if (sender === "") { throw new Error("MFA sender must be a non-empty address",); }
  await setConfig(options.database, MFA_EMAIL_SENDER_KEY, sender, "MFA sender address (admin override)",);
}

/** Persist an admin MFA rate-limit window override.
 * @param options Database handle plus window in ms.
 * @throws {Error} When the window is not a positive number.
 * @returns Resolves when stored. */
export async function saveMfaEmailWindowMs(options: { database: Kysely<DB>; windowMs: number },): Promise<void> {
  if (!Number.isFinite(options.windowMs,) || options.windowMs <= 0) {
    throw new Error("MFA rate-limit window must be a positive number of ms",);
  }

  await setConfig(
    options.database,
    MFA_EMAIL_RATE_LIMIT_WINDOW_MS_KEY,
    String(Math.floor(options.windowMs,),),
    "MFA send rate-limit window in ms (admin override)",
  );
}

/** Options for {@link sendMfaEmail}. */
export interface SendMfaEmailOptions {
  database: Kysely<DB>;
  bridge: MessageBridge;
  userId: string;
  factorId: string;
  purpose: ChallengePurpose;
  toEmail: string;
  limiter?: RateLimiter;
  ttlMs?: number;
  now?: () => number;
}

function fail(code: ChallengeError["code"], message: string,): { ok: false; error: ChallengeError } {
  return { ok: false, error: { code, message, }, };
}

/** Issue an MFA challenge and deliver its code to `toEmail` via the bridge.
 * Reserve the per-user budget at the gate (peek + record on the same tick —
 * no await between, so concurrent sends cannot both pass), then refund on
 * any issue/send failure so a retry is not starved by its own failed attempt.
 * @param options Database, bridge, user/factor/purpose, recipient, limiter, clock.
 * @returns The issued challenge, or a typed rate-limit/issue/delivery failure.
 * The plaintext code travels only in the result and the mail body — never logged. */
export async function sendMfaEmail(options: SendMfaEmailOptions,): Promise<ChallengeResult<IssuedChallenge>> {
  const { database, bridge, userId, factorId, purpose, toEmail, ttlMs, now = Date.now, } = options;
  const limiter = options.limiter ?? (await createMfaEmailLimiter({ database, },)).limiter;
  const at = now();
  const key = `mfa:${userId}`;

  if (!limiter.peek(key, at,).allowed) {
    return fail("rate_limited", "MFA code already sent — try again shortly",);
  }

  limiter.record(key, at,);

  // The open challenge superseded below — re-activated if delivery fails, so
  // a failed resend never strands a user holding a delivered code.
  const prior = await database
    .selectFrom("auth_challenges",)
    .select("id",)
    .where("user_id", "=", userId,)
    .where("factor_id", "=", factorId,)
    .where("purpose", "=", purpose,)
    .where("consumed", "=", 0,)
    .orderBy("created_at", "desc",)
    .executeTakeFirst();

  const issued = await issueChallenge({
    database,
    userId,
    factorId,
    purpose,
    ...(ttlMs === undefined ? {} : { ttlMs, }),
    now,
  },);

  if (!issued.ok) {
    limiter.refund(key,);
    return issued;
  }

  const minutes = Math.round((issued.value.expiresAt - at) / 60_000,);
  const body = `Your verification code is: ${issued.value.code}\nIt expires in ${minutes} minute${
    minutes === 1 ? "" : "s"
  }. If you did not request this, ignore this message.`;

  const sent = await bridge.send(toEmail, {
    id: randomUUID(),
    author: await readMfaEmailSender({ database, },),
    target: toEmail,
    body,
    timestamp: at,
  },);

  if (!sent.ok) {
    limiter.refund(key,);
    // Delivery failed: the new code never arrived, so consume it and
    // re-activate the challenge it superseded — the user's delivered code
    // still verifies.
    await database.transaction().execute(async (trx,) => {
      await trx
        .updateTable("auth_challenges",)
        .set({ consumed: 1, },)
        .where("id", "=", issued.value.id,)
        .execute();

      if (prior) {
        await trx
          .updateTable("auth_challenges",)
          .set({ consumed: 0, },)
          .where("id", "=", prior.id,)
          .where("consumed", "=", 1,)
          .execute();
      }
    },);

    return fail("delivery_failed", `MFA email delivery failed: ${sent.message}`,);
  }

  return issued;
}
