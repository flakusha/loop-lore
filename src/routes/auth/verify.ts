// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * MFA factor verify endpoint (epic-auth-channel-provisioning, slice 3 of 3).
 * POST /api/v1/auth/factors/verify: consume a challenge and elevate the
 * session JWT with `amr` + `auth_time`. Channel-agnostic: any issued
 * challenge (email now, messenger later) verifies through this one path.
 */
import type { Kysely, } from "kysely";
import { verifyChallenge, } from "../../auth/factors/challenge";
import { signJwt, } from "../../auth/jwt";
import type { Config, } from "../../config/schema";
import { ChallengePurpose, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { RateLimiter, } from "../../middleware/rate-limit";
import { can, } from "../../users/permissions";
import { notFound, unauthorized, } from "../../validation/middleware";
import { HttpStatus, jsonError, } from "../http-utils";
import { setTokenCookie, } from "./shared";

/** Step-up permission gate: any authenticated session may verify its own factor.
 * `chat.join` is the minimal grant every role (user/player/viewer/guest/bot)
 * holds, so the gate rejects only anonymous/roleless callers while
 * `verifyChallenge` still binds the challenge to the caller's own userId. */
export const MFA_VERIFY_PERMISSION = "chat.join";

/** Options for {@link handleVerifyFactor}. */
export interface VerifyFactorOptions {
  database: Kysely<DB>;
  config: Config;
  userId: string | null;
  sessionId: string | null;
  userRole: string | null;
  challengeId: string;
  code: string;
  purpose: ChallengePurpose;
  /** Per-user verify budget; omitted means unthrottled (tests). */
  limiter?: RateLimiter;
  now?: () => number;
}

/** Consume one unit of the per-user verify budget.
 * @param limiter Rate limiter owning the budget.
 * @param userId Budget owner.
 * @param now Injected clock.
 * @returns True when the attempt may proceed, false when throttled. */
function consumeVerifyBudget(limiter: RateLimiter, userId: string, now: () => number,): boolean {
  const key = `verify:${userId}`;
  if (!limiter.peek(key, now(),).allowed) { return false; }
  limiter.record(key, now(),);
  return true;
}

/** Verify an MFA challenge and elevate the session with step-up claims.
 * The session must already be authenticated and hold the step-up
 * permission; `verifyChallenge` must consume the challenge for a factor
 * owned by that same user. On success the JWT is re-signed with
 * `amr: ["mfa-<kind>"]` and `auth_time`.
 * @param options Database, config, derived session identity, challenge fields.
 * @throws {Error} When the JWT secret is missing or signing fails.
 * @returns The elevated-session response (new token cookie) or a typed error. */
export async function handleVerifyFactor(options: VerifyFactorOptions,): Promise<Response> {
  const { database, config, userId, sessionId, userRole, challengeId, code, purpose, now = Date.now, } = options;
  if (!userId || !sessionId) { return unauthorized(); }
  if (!can(userRole, MFA_VERIFY_PERMISSION,)) {
    return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden, },);
  }

  // Route-level verify budget per user — the store already caps attempts
  // per challenge; this caps rapid-fire probing across challenges.
  if (options.limiter !== undefined && !consumeVerifyBudget(options.limiter, userId, now,)) {
    return jsonError({
      message: "Too many verification attempts — try again shortly",
      status: HttpStatus.TooManyRequests,
    },);
  }

  // Unverified factors have zero auth power. Check BEFORE verifyChallenge so
  // a refused challenge is not consumed. Enroll is the one purpose that may
  // activate an unverified factor.
  const challengeState = await database
    .selectFrom("auth_challenges",)
    .innerJoin("auth_factors", "auth_factors.id", "auth_challenges.factor_id",)
    .select("auth_factors.verified_at",)
    .where("auth_challenges.id", "=", challengeId,)
    .where("auth_challenges.user_id", "=", userId,)
    .where("auth_challenges.purpose", "=", purpose,)
    .executeTakeFirst();

  if (
    challengeState === undefined ||
    (purpose !== ChallengePurpose.Enroll && challengeState.verified_at === null)
  ) {
    return notFound("Not found",);
  }

  const verified = await verifyChallenge({ database, challengeId, userId, code, purpose, now, },);
  if (!verified.ok) {
    const errorCode = verified.error.code;
    const status = errorCode === "not_found" || errorCode === "purpose_mismatch"
      ? HttpStatus.NotFound
      : errorCode === "expired" || errorCode === "consumed"
      ? HttpStatus.Gone
      : HttpStatus.Unauthorized;

    return jsonError({ message: verified.error.message, status, },);
  }

  if (purpose === ChallengePurpose.Enroll) {
    // Ownership proved on the enrolled channel: activate it once. No JWT —
    // enrollment is not a login or step-up event.
    await database
      .updateTable("auth_factors",)
      .set({ verified_at: now(), },)
      .where("id", "=", verified.value.factorId,)
      .where("user_id", "=", userId,)
      .where("verified_at", "is", null,)
      .execute();

    return new Response("OK", { status: HttpStatus.OK, },);
  }

  const factor = await database
    .selectFrom("auth_factors",)
    .select("kind",)
    .where("id", "=", verified.value.factorId,)
    .executeTakeFirst();

  const method = `mfa-${factor?.kind ?? "unknown"}`;
  const jwtSecret = config.auth.jwtSecret;
  if (!jwtSecret) {
    return jsonError({
      message: "Server misconfigured: JWT secret not set",
      status: HttpStatus.InternalServerError,
    },);
  }

  const user = await database
    .selectFrom("users",)
    .select("role",)
    .where("id", "=", userId,)
    .executeTakeFirst();

  if (!user) { return notFound("User not found",); }

  const jwtExpiresIn = config.auth.jwtExpiresIn ?? 86_400;
  const authTime = Math.floor(now() / 1000,);
  const token = await signJwt({
    secret: jwtSecret,
    userId,
    role: user.role,
    sessionId,
    expiresInSeconds: jwtExpiresIn,
    amr: [method,],
    authTime,
  },);

  // ponytail: no step-up session-row write; the JWT is the claim carrier
  // (sessions rows hold only the revocation pointer + expiry) — elevation
  // dies with the session and re-verify re-mints.
  return new Response("OK", {
    status: HttpStatus.OK,
    headers: { "Set-Cookie": setTokenCookie(token, jwtExpiresIn,), },
  },);
}
