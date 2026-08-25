// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Authenticate middleware — JWT token verification with solo fallback.
 *
 * Auth modes:
 *   1. Token presented + valid JWT → authenticated user context
 *   2. No token + !required → solo/demo user context (cached)
 *   3. No token + required → 401 Unauthorized
 *   4. Token presented + invalid + !required → solo/demo fallback
 */
import type { Kysely, } from "kysely";
import { verifyJwt, } from "../../auth/jwt";
import { UserRole, UserStatus, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger/index";
import { LL_TOKEN, } from "../../regex/cookies";
import { ErrorCode, HttpStatus, jsonError, } from "../../routes/http-utils";
import type { RequestContext, } from "../types";
import { createRequestContext, } from "../types";
import { getOrCreateSoloUserForAuth, } from "./solo-user";
import type { AuthenticateOpts, } from "./types";

let _log: ReturnType<typeof getLogger> | null = null;
function getLog() {
  try {
    _log ??= getLogger().child({ module: "auth", },);
    return _log;
  } catch {
    return null;
  }
}

/** Extract the raw JWT from the Authorization header or cookie. */
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
 *
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
  const nowMs = Date.now();
  const notExpired = session !== undefined &&
    (session.expires_at === null ||
      Date.parse(session.expires_at,) > nowMs);
  if (!session || !notExpired) {
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
  } catch {
    /* non-critical */
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
 * that user's context. Otherwise, fall back to solo/demo user if
 * authConfig.required === false. If auth is required and no valid
 * token is provided, return 401.
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
