// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Token extraction + user-id resolution from a request.
 */
import type { Kysely, } from "kysely";
import { verifyJwt, } from "../../auth/jwt";
import { loadConfig, } from "../../config/load";
import { LL_TOKEN, } from "../../regex/cookies";
import type { AuthConfig, } from "../../config/schema/auth";
import type { DB, } from "../../db/schema";
import { UserStatus, } from "../../db/enums";
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
 *
 * Security: after resolving `session.user_id`, the user's row is queried to
 * check `users.status`. Disabled/Deactivated users fall through to the solo
 * fallback, mirroring `authenticate.ts#verifyTokenContext`. Without this
 * gate, a disabled user who still holds a valid session token could
 * impersonate themselves on the export routes. See
 * BUG-resolveuseridfromrequest-missing-user-status-check.
 *
 * @param request - Incoming request (reads the Cookie header)
 * @param database - Kysely database handle
 * @param demoUsername - Demo username used for the solo fallback
 * @param authConfig - Optional pre-loaded auth config (DI). When omitted,
 *   `loadConfig()` is called per request — kept for back-compat with
 *   existing callers; high-throughput callers should pre-load via
 *   `authenticate.ts`'s pattern.
 * @returns The resolved user id, or null if not determinable
 */
export async function resolveUserIdFromRequest(
  request: Request,
  database: Kysely<DB>,
  demoUsername: string,
  authConfig?: AuthConfig,
): Promise<string | null> {
  const cookieHeader = request.headers.get("Cookie",);
  const match = cookieHeader ? LL_TOKEN.exec(cookieHeader,) : null;
  const token = match?.[1] ?? null;
  const nowMs = Date.now();

  // Resolve userId from JWT (preferred) or legacy sha256(token) fallback,
  // whichever matches first. Both paths must check the user-status gate
  // (Disabled/Deactivated rejection) before returning.
  const config: AuthConfig = authConfig ?? loadConfig().auth;
  const candidateUserId = token
    ? await resolveUserIdFromSession(database, config, token, nowMs,)
    : null;
  if (candidateUserId !== null) {
    const user = await database
      .selectFrom("users",)
      .select(["status",],)
      .where("id", "=", candidateUserId,)
      .executeTakeFirst();
    if (
      user &&
      user.status !== UserStatus.Disabled &&
      user.status !== UserStatus.Deactivated
    ) {
      return candidateUserId;
    }
  }

  const solo = await getOrCreateSoloUserForAuth(database, demoUsername,);
  return solo?.id ?? null;
}

/**
 * Resolve a userId from a session lookup — tries JWT first (if jwtSecret
 * configured), then legacy sha256(token). Returns null on miss / expiry.
 * The caller is responsible for the user-status gate; this helper only
 * resolves the candidate id.
 */
async function resolveUserIdFromSession(
  database: Kysely<DB>,
  config: AuthConfig,
  token: string,
  nowMs: number,
): Promise<string | null> {
  const secret = config.jwtSecret;
  if (secret) {
    const result = await verifyJwt({ secret, token, },);
    if (result.valid) {
      const sid = result.payload.sid;
      if (sid) {
        const session = await database
          .selectFrom("sessions",)
          .select(["user_id", "expires_at"],)
          .where("id", "=", sid,)
          .executeTakeFirst();
        if (
          session &&
          (session.expires_at === null || Date.parse(session.expires_at,) > nowMs)
        ) {
          return session.user_id;
        }
      }
    }
  }

  if (config.legacyOpaqueTokenFallback) {
    const tokenHash = sha256Hex(token,);
    const session = await database
      .selectFrom("sessions",)
      .select(["user_id", "expires_at"],)
      .where("token_hash", "=", tokenHash,)
      .executeTakeFirst();
    if (session && (session.expires_at === null || Date.parse(session.expires_at,) > nowMs)) {
      return session.user_id;
    }
  }

  return null;
}
