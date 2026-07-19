/**
 * Auth middleware — JWT token verification.
 *
 * Token extraction: Bearer header > Cookie fallback.
 * Auth modes:
 *   1. Token presented + valid JWT → authenticated user context
 *   2. No token + !required → solo/demo user context (cached)
 *   3. No token + required → 401 Unauthorized
 *   4. Token presented + invalid + !required → solo/demo fallback
 */

import type { Kysely, } from "kysely";
import { verifyJwt, } from "../auth/jwt";
import type { AuthConfig, } from "../config/schema";
import { UserRole, UserStatus, } from "../db/enums";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger/index";
import { ErrorCode, HttpStatus, jsonError, } from "../routes/http-utils";
import { uid, } from "../utils";
import type { RequestContext, } from "./types";

let _log: ReturnType<typeof getLogger> | null = null;
function getLog() {
  try {
    _log ??= getLogger().child({ module: "auth", },);
    return _log;
  } catch {
    return null;
  }
}

export interface AuthenticateOpts {
  request: Request;
  database: Kysely<DB>;
  authConfig: AuthConfig;
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
      const match = /(?:^|;\s*)ll_token=([^;]+)/.exec(cookieHeader,);
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

        // Check if session still exists (logout = delete session row)
        const session = await database
          .selectFrom("sessions",)
          .select(["id",],)
          .where("id", "=", payload.sid,)
          .executeTakeFirst();

        if (session) {
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
              context: {
                userId: payload.sub,
                userRole: user.role,
                sessionId: payload.sid,
              },
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
      context: {
        userId: soloUser.id,
        userRole: UserRole.Solo,
        sessionId: null,
      },
    };
  }

  // ── Auth required, no valid token ─────────────────────────
  return jsonError({
    message: "Missing or invalid Authorization header",
    status: HttpStatus.Unauthorized,
    code: ErrorCode.Unauthorized,
  },);
}

// ── Solo user helpers ─────────────────────────────────────────

// Per-DB-instance solo user cache — prevents cross-test-server corruption
// when multiple Bun.serve instances share the same process (BUG.2).
const soloUserCache = new Map<Kysely<DB>, { id: string } | null>();

/**
 * Get or create the singleton solo/demo user.
 * Cached in-memory after first lookup.
 * Exported for use in routes/auth.ts.
 */
export async function getOrCreateSoloUserForAuth(
  database: Kysely<DB>,
  demoUsername: string,
): Promise<{ id: string } | null> {
  const cached = soloUserCache.get(database,);
  if (cached !== undefined) { return cached; }

  // Resolve the solo/demo user id (pre-seeded, demo, or created on first run).
  const existing = await database
    .selectFrom("users",)
    .select(["id",],)
    .where("role", "=", UserRole.Solo,)
    .executeTakeFirst();

  let soloId: string;
  if (existing) {
    soloId = existing.id;
  } else {
    // Check demo user (seeded via src/db/seed.ts or config)
    const demoUser = await database
      .selectFrom("users",)
      .select(["id",],)
      .where("username", "=", demoUsername,)
      .executeTakeFirst();

    if (demoUser) {
      soloId = demoUser.id;
    } else {
      // Create solo user on first run
      soloId = uid();
      try {
        await database
          .insertInto("users",)
          .values({
            id: soloId,
            username: demoUsername,
            display_name: "Solo User",
            role: UserRole.Solo,
            status: UserStatus.Active,
            settings: "{}",
          },)
          .execute();
      } catch {
        /* race: another request may have created it — next lookup will find it */
      }
    }
  }

  // Ensure the solo user has a corresponding actor. chat_participants.actor_id
  // references actors.id, and chat creation inserts the owner as actor_id = userId,
  // so the actor MUST exist or chat creation fails with a FOREIGN KEY constraint.
  // This also covers users pre-seeded by src/db/seed.ts (which creates the user
  // but not its actor).
  try {
    const actorExists = await database
      .selectFrom("actors",)
      .select("id",)
      .where("id", "=", soloId,)
      .executeTakeFirst();
    if (!actorExists) {
      await database
        .insertInto("actors",)
        .values({
          id: soloId,
          actor_type: "user",
          display_name: "Solo User",
          user_id: soloId,
          owner_id: soloId,
          agent_type: "none",
          settings: "{}",
          import_spec: "raw",
          data_version: 0,
        },)
        .execute();
    }
  } catch {
    /* race-safe: actor may already exist */
  }

  const result = { id: soloId, };
  soloUserCache.set(database, result,);
  return result;
}

/**
 * Clear the cached solo user reference (for testing).
 */
export function resetSoloUserCache(): void {
  soloUserCache.clear();
}

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
