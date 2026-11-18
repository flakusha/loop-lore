// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * MFA messenger channel (1.0.0 MFA code-channel-first).
 * Issues a challenge and delivers its code to a messenger handle through
 * the message bridge. Mirrors the email channel: same budget semantics
 * (reserve at the gate, refund on failure, re-activate the superseded
 * challenge when delivery fails), separate per-user budget keyed by its
 * own window so the two channels never share a budget.
 * The plaintext code travels only in the result and the message body — never logged.
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { getConfigValue, setConfig, } from "../../admin/config";
import type { ChallengePurpose, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { MessageBridge, } from "../../integrations/bridge";
import { createRateLimiter, type RateLimiter, } from "../../middleware/rate-limit";
import { issueChallenge, } from "../factors/challenge";
import type { ChallengeError, ChallengeResult, IssuedChallenge, } from "../factors/types";

/** `system_config` key holding the messenger bot token (admin-override layer). */
export const MFA_MESSENGER_BOT_TOKEN_KEY = "integrations.messenger.mfa_bot_token";

/** `system_config` key holding the bot handle stamped as the message author. */
export const MFA_MESSENGER_SENDER_KEY = "integrations.messenger.mfa_sender";

/** `system_config` key holding the MFA send rate-limit window in ms. */
export const MFA_MESSENGER_RATE_LIMIT_WINDOW_MS_KEY = "integrations.messenger.mfa_rate_limit_window_ms";

/** Default MFA send window — one code per user per 60s. */
export const MFA_MESSENGER_DEFAULT_WINDOW_MS = 60_000;

/** Default bot handle stamped on MFA messages when none is configured. */
export const MFA_MESSENGER_DEFAULT_SENDER = "loop-lore-mfa-bot";

// Module-singleton limiter: each createRateLimiter() owns a Map + prune
// timer, so a fresh instance per send would never limit and would leak an
// interval per call. Cached by resolved window, like the email channel.
let cached: { windowMs: number; limiter: RateLimiter } | undefined;

/** Build a per-user MFA send limiter from the stored window override.
 * @param options Database handle plus optional window override.
 * @returns The limiter and its resolved window. */
export async function createMfaMessengerLimiter(
  options: { database: Kysely<DB>; windowMs?: number },
): Promise<{ limiter: RateLimiter; windowMs: number }> {
  const resolved = options.windowMs ?? await readMfaMessengerWindowMs({ database: options.database, },);
  if (cached !== undefined && cached.windowMs === resolved) { return cached; }
  const fresh = { windowMs: resolved, limiter: createRateLimiter({ windowMs: resolved, maxRequests: 1, },), };
  cached = fresh;
  return fresh;
}

/** Effective MFA send window (stored override wins, default otherwise).
 * @param options Database handle.
 * @returns Window in ms. */
export async function readMfaMessengerWindowMs(options: { database: Kysely<DB> },): Promise<number> {
  const raw = await getConfigValue(options.database, MFA_MESSENGER_RATE_LIMIT_WINDOW_MS_KEY,);
  const parsed = raw === undefined ? Number.NaN : Number(raw,);
  if (Number.isFinite(parsed,) && parsed > 0) { return Math.floor(parsed,); }
  return MFA_MESSENGER_DEFAULT_WINDOW_MS;
}

/** Effective bot handle (stored override wins, default otherwise).
 * @param options Database handle.
 * @returns Bot handle. */
export async function readMfaMessengerSender(options: { database: Kysely<DB> },): Promise<string> {
  const trimmed = (await getConfigValue(options.database, MFA_MESSENGER_SENDER_KEY,))?.trim();
  if (trimmed) { return trimmed; }
  return MFA_MESSENGER_DEFAULT_SENDER;
}

/** Configured bot token, if any. Empty means the channel is unconfigured —
 * the issue route maps that to "delivery unavailable", never to a throw.
 * @param options Database handle.
 * @returns The stored bot token, or undefined when unset. */
export async function readMfaMessengerBotToken(
  options: { database: Kysely<DB> },
): Promise<string | undefined> {
  const trimmed = (await getConfigValue(options.database, MFA_MESSENGER_BOT_TOKEN_KEY,))?.trim();
  return trimmed ? trimmed : undefined;
}

/** Persist an admin bot-handle override.
 * @param options Database handle plus bot handle.
 * @throws {Error} When the handle is empty.
 * @returns Resolves when stored. */
export async function saveMfaMessengerSender(options: { database: Kysely<DB>; sender: string },): Promise<void> {
  const sender = options.sender.trim();
  if (sender === "") { throw new Error("MFA bot handle must be non-empty",); }
  await setConfig(options.database, MFA_MESSENGER_SENDER_KEY, sender, "MFA messenger bot handle (admin override)",);
}

/** Persist an admin bot-token override.
 * @param options Database handle plus bot token.
 * @throws {Error} When the token is empty.
 * @returns Resolves when stored. */
export async function saveMfaMessengerBotToken(
  options: { database: Kysely<DB>; token: string },
): Promise<void> {
  const token = options.token.trim();
  if (token === "") { throw new Error("MFA bot token must be non-empty",); }
  await setConfig(options.database, MFA_MESSENGER_BOT_TOKEN_KEY, token, "MFA messenger bot token (admin override)",);
}

/** Persist an admin MFA rate-limit window override.
 * @param options Database handle plus window in ms.
 * @throws {Error} When the window is not a positive number.
 * @returns Resolves when stored. */
export async function saveMfaMessengerWindowMs(options: { database: Kysely<DB>; windowMs: number },): Promise<void> {
  if (!Number.isFinite(options.windowMs,) || options.windowMs <= 0) {
    throw new Error("MFA rate-limit window must be a positive number of ms",);
  }

  await setConfig(
    options.database,
    MFA_MESSENGER_RATE_LIMIT_WINDOW_MS_KEY,
    String(Math.floor(options.windowMs,),),
    "MFA messenger send rate-limit window in ms (admin override)",
  );
}

/** Options for {@link sendMfaMessenger}. */
export interface SendMfaMessengerOptions {
  database: Kysely<DB>;
  bridge: MessageBridge;
  userId: string;
  factorId: string;
  purpose: ChallengePurpose;
  toHandle: string;
  limiter?: RateLimiter;
  ttlMs?: number;
  now?: () => number;
}

function fail(code: ChallengeError["code"], message: string,): { ok: false; error: ChallengeError } {
  return { ok: false, error: { code, message, }, };
}

/** Issue an MFA challenge and deliver its code to `toHandle` via the bridge.
 * Reserve the per-user budget at the gate (peek + record on the same tick —
 * no await between, so concurrent sends cannot both pass), then refund on
 * any issue/send failure so a retry is not starved by its own failed attempt.
 * @param options Database, bridge, user/factor/purpose, recipient, limiter, clock.
 * @returns The issued challenge, or a typed rate-limit/issue/delivery failure.
 * The plaintext code travels only in the result and the message body — never logged. */
export async function sendMfaMessenger(
  options: SendMfaMessengerOptions,
): Promise<ChallengeResult<IssuedChallenge>> {
  const { database, bridge, userId, factorId, purpose, toHandle, ttlMs, now = Date.now, } = options;
  const limiter = options.limiter ?? (await createMfaMessengerLimiter({ database, },)).limiter;
  const at = now();
  const key = `mfa-messenger:${userId}`;

  // The configured bot token selects the ONLY adapter allowed to deliver.
  // No token (or a bridge without token binding) fails closed before any
  // challenge is issued or budget consumed — never route by target alone.
  const token = await readMfaMessengerBotToken({ database, },);
  const sendBound = bridge.sendWithToken;
  if (token === undefined || sendBound === undefined) {
    return fail("delivery_failed", "MFA messenger token is not bound to a delivery adapter",);
  }

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

  const sent = await sendBound(token, toHandle, {
    id: randomUUID(),
    author: await readMfaMessengerSender({ database, },),
    target: toHandle,
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

    return fail("delivery_failed", `MFA messenger delivery failed: ${sent.message}`,);
  }

  return issued;
}
