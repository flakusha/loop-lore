// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Token extraction + user-id resolution from a request.
 */
import type { Kysely, } from "kysely";
import crypto from "node:crypto";
import { verifyJwt, } from "../../auth/jwt";
import { loadConfig, } from "../../config/load";
import type { DB, } from "../../db/schema";
import { LL_TOKEN, } from "../../regex/cookies";
import { getOrCreateSoloUserForAuth, } from "./solo-user";

/**
 * Validate that a session token is well-formed (basic sanity).
 * Returns the raw token string or null.
 */
export function extractBearerToken(request: Request,): string | null {
  const header = request.headers.get("Authorization",);
  if (!header?.startsWith("Bearer ",)) { return null; }
  const token = header.slice("Bearer ".length,).trim();
  return token || null;
}

/**
 * Resolve the acting user id from a request, falling back to the solo user.
 *
 * Looks up the `ll_token` cookie, hashes it to a session `token_hash`, and
 * returns the session's `user_id`. If no token is present or no session
 * matches, returns the solo/demo user's id.
 *
 * @param request - Incoming request (reads the Cookie header)
 * @param database - Kysely database handle
 * @param demoUsername - Demo username used for the solo fallback
 * @returns The resolved user id, or null if not determinable
 */
export async function resolveUserIdFromRequest(
  request: Request,
  database: Kysely<DB>,
  demoUsername: string,
): Promise<string | null> {
  const cookieHeader = request.headers.get("Cookie",);
  const match = cookieHeader ? LL_TOKEN.exec(cookieHeader,) : null;
  const token = match?.[1] ?? null;
  const nowMs = Date.now();

  // JWTs are the production token: decode to sid, then resolve the session by
  // id (the legacy token_hash path below is kept for opaque-token sessions).
  if (token) {
    const config = loadConfig();
    const secret = config.auth.jwtSecret;
    if (secret) {
      const result = await verifyJwt({ secret, token, },);
      if (result.valid) {
        const sid = result.payload.sid;
        const session = sid
          ? await database
            .selectFrom("sessions",)
            .select(["user_id", "expires_at",],)
            .where("id", "=", sid,)
            .executeTakeFirst()
          : undefined;
        if (
          session &&
          (session.expires_at === null || Date.parse(session.expires_at,) > nowMs)
        ) {
          return session.user_id;
        }
      }
    }

    // Legacy opaque-token sessions keyed by sha256(token). SECURITY: this path
    // is gated behind `auth.legacyOpaqueTokenFallback` because it authenticates
    // any pre-existing `token_hash` row even when `auth.jwtSecret` is empty —
    // a secret-less deployment with a populated sessions table would otherwise
    // be a one-lookup auth bypass. Off by default; enable only for one-shot
    // legacy migrations, then disable.
    if (config.auth.legacyOpaqueTokenFallback) {
      const tokenHash = crypto.createHash("sha256",).update(token,).digest("hex",);
      const session = await database
        .selectFrom("sessions",)
        .select(["user_id", "expires_at",],)
        .where("token_hash", "=", tokenHash,)
        .executeTakeFirst();
      if (session && (session.expires_at === null || Date.parse(session.expires_at,) > nowMs)) {
        return session.user_id;
      }
    }
  }

  const solo = await getOrCreateSoloUserForAuth(database, demoUsername,);
  return solo?.id ?? null;
}
