// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * MFA challenge issue endpoint (1.0.0 MFA code-channel-first).
 * POST /api/v1/auth/factors/challenge: permission-gated code issuance
 * over the email channel or the messenger hook point. Channel-agnostic
 * verification lives in verify.ts — this path only sends codes.
 *
 * The recipient address comes from the caller, but the code is bound to
 * the caller's own factor: cross-user probing returns the same 404 as a
 * missing factor, and no response ever carries code material.
 */
import type { Kysely, } from "kysely";
import { sendMfaEmail, } from "../../auth/channels/email";
import { sendMfaMessenger, } from "../../auth/channels/messenger";
import type { ChallengePurpose, } from "../../db/enums";
import { FactorKind, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { MessageBridge, } from "../../integrations/bridge";
import type { RateLimiter, } from "../../middleware/rate-limit";
import { can, } from "../../users/permissions";
import { notFound, unauthorized, } from "../../validation/middleware";
import { HttpStatus, jsonError, jsonResponse, } from "../http-utils";

/** Step-up permission gate: any authenticated session may issue its own factor challenge. */
export const MFA_ISSUE_PERMISSION = "chat.join";

/** Code-delivery channels the issue path dispatches to. */
export type MfaIssueChannel = "email" | "messenger";

/** Options for {@link handleIssueChallenge}. */
export interface IssueChallengeOptions {
  database: Kysely<DB>;
  /** Delivery bridge; undefined means no transport is wired (503). */
  bridge: MessageBridge | undefined;
  userId: string | null;
  sessionId: string | null;
  userRole: string | null;
  factorId: string;
  channel: MfaIssueChannel;
  /** Caller-supplied recipient — code stays bound to the caller's factor. */
  destination: string;
  purpose: ChallengePurpose;
  emailLimiter?: RateLimiter;
  messengerLimiter?: RateLimiter;
  now?: () => number;
}

/** Address-shape test for the email channel (mirrors the email adapter). */
function isEmailDestination(destination: string,): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination,);
}

/** Issue an MFA challenge and deliver its code over the requested channel.
 * The session must already be authenticated and hold the step-up
 * permission; the factor must belong to the caller and match the channel.
 * @param options Database, bridge, derived session identity, factor/channel/destination, limiters, clock.
 * @returns The issued challenge id + expiry, or a typed error response.
 * No response carries code material; unknown and foreign factors share one 404. */
export async function handleIssueChallenge(options: IssueChallengeOptions,): Promise<Response> {
  const {
    database,
    bridge,
    userId,
    sessionId,
    userRole,
    factorId,
    channel,
    destination,
    purpose,
    now = Date.now,
  } = options;

  if (!userId || !sessionId) { return unauthorized(); }
  if (!can(userRole, MFA_ISSUE_PERMISSION,)) {
    return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden, },);
  }

  const to = destination.trim();
  const destinationOk = channel === "email"
    ? isEmailDestination(to,)
    : to !== "" && to.length <= 320;

  if (!destinationOk) {
    return jsonError({ message: "Invalid destination for the requested channel", status: HttpStatus.BadRequest, },);
  }

  const factor = await database
    .selectFrom("auth_factors",)
    .select("kind",)
    .where("id", "=", factorId,)
    .where("user_id", "=", userId,)
    .executeTakeFirst();

  // Unknown factor, foreign factor, and channel-kind mismatch share one
  // 404 — a differing body would let a caller probe factor existence.
  const kindOk = factor !== undefined && (channel === "email"
    ? factor.kind === FactorKind.Email
    : factor.kind === FactorKind.MessengerMatrix || factor.kind === FactorKind.MessengerIm);

  if (!kindOk) { return notFound("Not found",); }

  if (!bridge) {
    return jsonError({
      message: "Code delivery is unavailable — try again shortly",
      status: HttpStatus.ServiceUnavailable,
    },);
  }

  const sent = channel === "email"
    ? await sendMfaEmail({
      database,
      bridge,
      userId,
      factorId,
      purpose,
      toEmail: to,
      ...(options.emailLimiter === undefined ? {} : { limiter: options.emailLimiter, }),
      now,
    },)
    : await sendMfaMessenger({
      database,
      bridge,
      userId,
      factorId,
      purpose,
      toHandle: to,
      ...(options.messengerLimiter === undefined ? {} : { limiter: options.messengerLimiter, }),
      now,
    },);

  if (!sent.ok) {
    const errorCode = sent.error.code;
    if (errorCode === "rate_limited") {
      return jsonError({ message: sent.error.message, status: HttpStatus.TooManyRequests, },);
    }

    if (errorCode === "delivery_failed") {
      // Generic on purpose: the bridge message names transports/targets
      // the caller must not learn about.
      return jsonError({
        message: "Could not deliver the code — try again shortly",
        status: HttpStatus.BadGateway,
      },);
    }

    return notFound("Not found",);
  }

  return jsonResponse({ challengeId: sent.value.id, expiresAt: sent.value.expiresAt, },);
}
