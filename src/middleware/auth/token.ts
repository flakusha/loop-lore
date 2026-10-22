// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Token extraction + user-id resolution from a request.
 */
import type { Kysely, } from "kysely";
import { verifyJwt, } from "../../auth/jwt";
import { loadConfig, } from "../../config/load";
import type { AuthConfig, } from "../../config/schema/auth";
import { UserStatus, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getChildLogger, } from "../../logger/index";
import { LL_TOKEN, } from "../../regex/cookies";
import { parseExpiryMs, } from "../../utils/date";
import { getOrCreateSoloUserForAuth, } from "./solo-user";

/**
 * Hash a token to the hex sha256 fingerprint stored in `sessions.secret_hash`.
 *
 * Uses `Bun.CryptoHasher` (BoringSSL-backed, faster than `node:crypto.createHash`
 * for synchronous one-shot digests) but emits byte-identical output — verified
 * against the legacy `crypto.createHash("sha256").update(t).digest("hex")` form
 * with test vectors like `"hello-token-1"` (both produce
 * `7961a7f6...`). Existing `secret_hash` rows remain readable.
 * @param token
 */
function sha256Hex(token: string,): string {
  return new Bun.CryptoHasher("sha256",).update(token,).digest("hex",);
}

/**
 * Validate that a session token is well-formed (basic sanity).
 * Returns the raw token string or null.
 * @param request
 * @returns {string | null}
 */
export function extractBearerToken(request: Request,): string | null {
  const header = request.headers.get("Authorization",);
  if (!header?.startsWith("Bearer ",)) { return null; }
  const token = header.slice("Bearer ".length,).trim();
  return token || null;
}

/**
 * Resolve the acting user id from a request.
 *
 * Looks up the `ll_token` cookie, hashes it to a session `secret_hash`, and
 * returns the session's `user_id`.
 *
 * Security: after resolving `session.user_id`, the user's row is queried to
 * check `users.status`. Disabled/Deactivated users are denied. A token that
 * was PRESENTED but does not resolve to a usable user is a client error
 * (null) - it is never downgraded to the solo identity, mirroring
 * `authenticate.ts#verifyTokenContext`. The solo fallback applies only when
 * no token was presented at all AND the deployment does not enforce auth.
 * Without this, an expired or revoked session became the admin-equivalent
 * solo user on the export routes. See
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

  // A presented token that does not resolve to a usable user is a client
  // error - never an invitation to fall back to the solo identity. The
  // export routes turned this into an unauthenticated 200 + full export.
  if (token) {
    return null;
  }

  // No token at all: only a deployment that does not enforce auth may fall
  // back to the solo (admin-equivalent) identity.
  if (config.required) {
    return null;
  }

  const solo = await getOrCreateSoloUserForAuth(database, demoUsername,);
  return solo?.id ?? null;
}

/**
 * True when a session row is still live.
 *
 * Fail closed: an unparseable or missing expiry is a corrupt row, never
 * "never expires". Mirrors `authenticate.ts#verifyTokenContext`.
 * @param expiresAt
 * @param nowMs
 */
function isSessionLive(expiresAt: string | null, nowMs: number,): boolean {
  const expiresMs = parseExpiryMs(expiresAt,);
  return expiresMs !== null && expiresMs > nowMs;
}

/**
 * Resolve a userId from a session lookup — tries JWT first (if jwtSecret
 * configured), then legacy sha256(token). Returns null on miss / expiry.
 * The caller is responsible for the user-status gate; this helper only
 * resolves the candidate id.
 * @param database
 * @param config
 * @param token
 * @param nowMs
 */
async function resolveUserIdFromSession(
  database: Kysely<DB>,
  config: AuthConfig,
  token: string,
  nowMs: number,
): Promise<string | null> {
  const secret = config.jwtSecret;
  const log = getChildLogger("auth",);
  if (secret) {
    const result = await verifyJwt({ secret, token, },);
    if (result.valid) {
      const sid = result.payload.sid;
      if (sid) {
        const session = await database
          .selectFrom("sessions",)
          .select(["user_id", "expires_at",],)
          .where("id", "=", sid,)
          .executeTakeFirst();

        if (session) {
          if (isSessionLive(session.expires_at, nowMs,)) {
            return session.user_id;
          }

          log?.debug("JWT session expired or corrupt", { sid, },);
        }
      }
    }
  }

  if (config.legacyOpaqueTokenFallback) {
    const tokenHash = sha256Hex(token,);
    const session = await database
      .selectFrom("sessions",)
      .select(["user_id", "expires_at",],)
      .where("secret_hash", "=", tokenHash,)
      .executeTakeFirst();

    if (session) {
      if (isSessionLive(session.expires_at, nowMs,)) {
        return session.user_id;
      }

      log?.debug("Legacy session expired or corrupt", { userId: session.user_id, },);
    }
  }

  return null;
}
