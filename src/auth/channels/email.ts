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

/** Build a per-user MFA send limiter from the stored window override.
 * @param options Database handle plus optional window override.
 * @returns The limiter and its resolved window. */
export async function createMfaEmailLimiter(
  options: { database: Kysely<DB>; windowMs?: number },
): Promise<{ limiter: RateLimiter; windowMs: number }> {
  const resolved = options.windowMs ?? await readMfaEmailWindowMs({ database: options.database, },);
  return { limiter: createRateLimiter({ windowMs: resolved, maxRequests: 1, },), windowMs: resolved, };
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
 * Peek the per-user limiter, issue, send, then record — a delivery failure
 * records nothing, so a retry is not starved by its own failed attempt.
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

  const issued = await issueChallenge({
    database,
    userId,
    factorId,
    purpose,
    ...(ttlMs === undefined ? {} : { ttlMs, }),
    now,
  },);

  if (!issued.ok) { return issued; }

  const body =
    `Your verification code is: ${issued.value.code}\nIt expires in 10 minutes. If you did not request this, ignore this message.`;

  const sent = await bridge.send(toEmail, {
    id: randomUUID(),
    author: await readMfaEmailSender({ database, },),
    target: toEmail,
    body,
    timestamp: at,
  },);

  if (!sent.ok) {
    return fail("delivery_failed", `MFA email delivery failed: ${sent.message}`,);
  }

  limiter.record(key, at,);
  return issued;
}
