// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Authenticate middleware — JWT token verification with solo fallback.
 *
 * Auth modes:
 *   1. Token presented + valid JWT → authenticated user context
 *   2. No token + !required → solo/demo user context (cached)
 *   3. No token + required → 401 Unauthorized
 *   4. Token presented + invalid → 401 Unauthorized (a *missing* token may fall
 *      back to solo; a *bad* one never does)
 *   5. Token presented + no jwtSecret configured → solo fallback + warn (server
 *      misconfiguration; single-user local setups depend on it)
 */
import type { Kysely, } from "kysely";
import { verifyJwt, } from "../../auth/jwt";
import { UserRole, UserStatus, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getChildLogger, } from "../../logger/index";
import { LL_TOKEN, } from "../../regex/cookies";
import { ErrorCode, HttpStatus, jsonError, } from "../../routes/http-utils";
import { parseExpiryMs, } from "../../utils/date";
import type { RequestContext, } from "../types";
import { createRequestContext, } from "../types";
import { getOrCreateSoloUserForAuth, } from "./solo-user";
import type { AuthenticateOpts, } from "./types";

/** */
function getLog() {
  return getChildLogger("auth",);
}

/**
 * Extract the raw JWT from the Authorization header or cookie.
 * @param request
 */
function extractToken(request: Request,): string | null {
  const authHeader = request.headers.get("Authorization",);
  if (authHeader?.startsWith("Bearer ",)) {
    return authHeader.slice("Bearer ".length,).trim();
  }

  const cookieHeader = request.headers.get("Cookie",);
  if (cookieHeader) {
    const match = LL_TOKEN.exec(cookieHeader,);
    if (match) { return match[1]!; }
  }

  return null;
}

/**
 * Verify a JWT against the session table and return the user context.
 * @param database - App database
 * @param rawToken - JWT from the request
 * @param secret - JWT signing secret
 * @returns Authenticated request context, or null when verification fails
 */
async function verifyTokenContext(
  database: Kysely<DB>,
  rawToken: string,
  secret: string,
): Promise<RequestContext | null> {
  const result = await verifyJwt({ secret, token: rawToken, },);
  if (!result.valid) {
    getLog()?.debug("JWT verification failed", { error: result.error, },);
    return null;
  }

  const { payload, } = result;

  // Session must still exist (logout = delete session row) and be unexpired.
  const session = await database
    .selectFrom("sessions",)
    .select(["id", "expires_at",],)
    .where("id", "=", payload.sid,)
    .executeTakeFirst();

  if (session === undefined) {
    return null;
  }

  const nowMs = Date.now();
  // parseExpiryMs returns null for null / empty / unparseable. `sessions.expires_at`
  // is NOT NULL and its only writer (routes/auth/session.ts) always stores a
  // valid ISO instant, so null means a corrupt row — not "never expires". Fail
  // closed instead of minting an eternal session out of unparseable data.
  const expiresMs = parseExpiryMs(session.expires_at,);
  const notExpired = expiresMs !== null && expiresMs > nowMs;
  if (!notExpired) {
    getLog()?.debug("JWT session not found (logged out?)", { sid: payload.sid, },);
    return null;
  }

  // User must still exist and be active.
  const user = await database
    .selectFrom("users",)
    .select(["role", "status",],)
    .where("id", "=", payload.sub,)
    .executeTakeFirst();

  if (!user || user.status === UserStatus.Disabled || user.status === UserStatus.Deactivated) {
    getLog()?.debug("JWT user not found or deactivated", { sub: payload.sub, },);
    return null;
  }

  // Update last activity (throttled: at most once per 5 minutes)
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000,).toISOString();
    await database
      .updateTable("users",)
      .set({ last_seen_at: new Date().toISOString(), },)
      .where("id", "=", payload.sub,)
      .where("last_seen_at", "<", fiveMinutesAgo,)
      .execute();
  } catch (err) {
    getLog()?.warn("Failed to update last_seen_at", { sub: payload.sub, err, },);
  }

  return createRequestContext({
    userId: payload.sub,
    userRole: user.role,
    sessionId: payload.sid,
  },);
}

/**
 * Attempt to authenticate the request.
 *
 * Priority: try JWT (Bearer header > cookie) first. If valid, return
 * that user's context. If a token was presented but failed verification,
 * return 401 — solo fallback applies only when NO token was presented and
 * authConfig.required === false.
 * @param root0
 * @param root0.request
 * @param root0.database
 * @param root0.authConfig
 * @returns {Promise<Response | { context: RequestContext; }>}
 */
export async function authenticate({
  request,
  database,
  authConfig,
}: AuthenticateOpts,): Promise<Response | { context: RequestContext }> {
  const rawToken = extractToken(request,);

  // ── Try JWT auth first (if token presented) ──────────────
  if (rawToken && authConfig.jwtSecret) {
    const context = await verifyTokenContext(database, rawToken, authConfig.jwtSecret,);
    if (context) {
      return { context, };
    }

    // A presented-but-invalid token (expired, tampered, revoked session) is a
    // client error — never an invitation to fall back to solo. The solo path is
    // only for requests that present NO token at all.
    getLog()?.warn("JWT presented but failed verification — rejecting",);
    return jsonError({
      message: "Invalid or expired token",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    },);
  } else if (rawToken) {
    getLog()?.warn("JWT secret not configured — falling back to solo mode",);
  }

  // ── Fallback: solo mode if auth not required ──────────────
  if (!authConfig.required) {
    const soloUser = await getOrCreateSoloUserForAuth(database, authConfig.demoUsername,);
    if (!soloUser) {
      return jsonError({
        message: "Server misconfigured: no solo user",
        status: HttpStatus.InternalServerError,
      },);
    }

    return {
      context: createRequestContext({
        userId: soloUser.id,
        userRole: UserRole.Solo,
        sessionId: null,
      },),
    };
  }

  // ── Auth required, no valid token ─────────────────────────
  // Note: Auth runs before i18n context, so error messages stay in English.
  // The i18n middleware will handle locale detection for subsequent middleware.
  return jsonError({
    message: "Missing or invalid Authorization header",
    status: HttpStatus.Unauthorized,
    code: ErrorCode.Unauthorized,
  },);
}
