// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * MFA challenge issue route (1.0.0 MFA code-channel-first).
 *
 *   POST /api/auth/factors/challenge — permission-gated code issuance,
 *   delivered over email or messenger.
 *
 * Split from index.ts (size-strict); mounted via .use() so the public
 * path is unchanged.
 */
import { Elysia, } from "elysia";
import { createMfaEmailLimiter, } from "../../auth/channels/email";
import { createMfaMessengerLimiter, } from "../../auth/channels/messenger";
import type { ChallengePurpose, } from "../../db/enums";
import { ErrorResponse, IssueChallengeBody, SuccessResponse, } from "../../validation/schemas";
import { handleIssueChallenge, } from "./challenge";
import type { HandleOpts, } from "./types";

/**
 * Mount the MFA challenge-issue endpoint on `prefix`.
 */
export function challengeRoute(
  { database, bridge, }: Pick<HandleOpts, "database" | "bridge">,
  prefix = "/api",
): Elysia {
  return new Elysia({ name: "auth-challenge", },)
    .post(
      `${prefix}/auth/factors/challenge`,
      async ({ body, ...rest },) => {
        const userId = "userId" in rest && typeof rest.userId === "string"
          ? rest.userId
          : null;

        const sessionId = "sessionId" in rest && typeof rest.sessionId === "string"
          ? rest.sessionId
          : null;

        const userRole = "userRole" in rest && typeof rest.userRole === "string"
          ? rest.userRole
          : null;

        const { factorId, channel, destination, purpose, } = body as {
          factorId: string;
          channel: "email" | "messenger";
          destination: string;
          purpose: ChallengePurpose;
        };

        // Channel budgets are self-caching singletons resolved against the
        // stored window — one issue shares the resend budget by design.
        const { limiter: emailLimiter, } = await createMfaEmailLimiter({ database, },);
        const { limiter: messengerLimiter, } = await createMfaMessengerLimiter({ database, },);

        return handleIssueChallenge({
          database,
          bridge,
          userId,
          sessionId,
          userRole,
          factorId,
          channel,
          destination,
          purpose,
          emailLimiter,
          messengerLimiter,
        },);
      },
      {
        body: IssueChallengeBody,
        response: {
          200: SuccessResponse,
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
          429: ErrorResponse,
          502: ErrorResponse,
          503: ErrorResponse,
        },
        detail: {
          summary: "Issue MFA challenge",
          description: "Issue a single-use code challenge and deliver it over email or messenger.",
          tags: ["Auth",],
        },
      },
    );
}
