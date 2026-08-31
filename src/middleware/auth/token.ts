// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Token extraction + user-id resolution from a request.
 */
import type { Kysely, } from "kysely";
import { verifyJwt, } from "../../auth/jwt";
import { loadConfig, } from "../../config/load";
import type { DB, } from "../../db/schema";
import { LL_TOKEN, } from "../../regex/cookies";
import { getOrCreateSoloUserForAuth, } from "./solo-user";

/**
 * Hash a token to the hex sha256 fingerprint stored in `sessions.token_hash`.
 *
 * Uses `Bun.CryptoHasher` (BoringSSL-backed, faster than `node:crypto.createHash`
 * for synchronous one-shot digests) but emits byte-identical output — verified
 * against the legacy `crypto.createHash("sha256").update(t).digest("hex")` form
 * with test vectors like `"hello-token-1"` (both produce
 * `7961a7f6...`). Existing `token_hash` rows remain readable.
 * @param token
 */
function sha256Hex(token: string,): string {
  return new Bun.CryptoHasher("sha256",).update(token,).digest("hex",);
}

/**
 * Validate that a session token is well-formed (basic sanity).
 * Returns the raw token string or null.
 * @param request
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

    if (config.auth.legacyOpaqueTokenFallback) {
      const tokenHash = sha256Hex(token,);
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
