/**
 * Authenticate middleware — JWT token verification with solo fallback.
 *
 * Auth modes:
 *   1. Token presented + valid JWT → authenticated user context
 *   2. No token + !required → solo/demo user context (cached)
 *   3. No token + required → 401 Unauthorized
 *   4. Token presented + invalid + !required → solo/demo fallback
 */
import { verifyJwt, } from "../../auth/jwt";
import { UserRole, UserStatus, } from "../../db/enums";
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
  // ── Extract token: Bearer header > cookie fallback ───────
  let rawToken: string | null = null;

  const authHeader = request.headers.get("Authorization",);
  if (authHeader?.startsWith("Bearer ",)) {
    rawToken = authHeader.slice("Bearer ".length,).trim();
  }

  // Cookie fallback (set by login/demo-login)
  if (!rawToken) {
    const cookieHeader = request.headers.get("Cookie",);
    if (cookieHeader) {
      const match = LL_TOKEN.exec(cookieHeader,);
      if (match) { rawToken = match[1]!; }
    }
  }

  // ── Try JWT auth first (if token presented) ──────────────
  if (rawToken) {
    const secret = authConfig.jwtSecret;
    if (secret) {
      const result = await verifyJwt({ secret, token: rawToken, },);

      if (result.valid) {
        const { payload, } = result;

        // Check if session still exists (logout = delete session row) and has
        // not expired (sessionTimeoutHours from login).
        const session = await database
          .selectFrom("sessions",)
          .select(["id", "expires_at",],)
          .where("id", "=", payload.sid,)
          .executeTakeFirst();

        const nowMs = Date.now();
        const notExpired = session !== undefined &&
          (session.expires_at === null ||
            Date.parse(session.expires_at,) > nowMs);

        if (session && notExpired) {
          // Fetch user to verify they still exist and are active
          const user = await database
            .selectFrom("users",)
            .select(["role", "status",],)
            .where("id", "=", payload.sub,)
            .executeTakeFirst();

          if (user && user.status !== UserStatus.Disabled && user.status !== UserStatus.Deactivated) {
            // Update last activity (non-blocking)
            try {
              await database
                .updateTable("users",)
                .set({ last_seen_at: new Date().toISOString(), },)
                .where("id", "=", payload.sub,)
                .execute();
            } catch {
              /* non-critical */
            }

            return {
              context: createRequestContext({
                userId: payload.sub,
                userRole: user.role,
                sessionId: payload.sid,
              },),
            };
          }

          getLog()?.debug("JWT user not found or deactivated", { sub: payload.sub, },);
        } else {
          getLog()?.debug("JWT session not found (logged out?)", { sid: payload.sid, },);
        }
      } else {
        getLog()?.debug("JWT verification failed", { error: result.error, },);
      }
    } else {
      getLog()?.warn("JWT secret not configured — falling back to solo mode",);
    }
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
