/**
 * Auth middleware — session token extraction & validation.
 *
 * Token extraction: Bearer header > Cookie fallback.
 * Auth modes:
 *   1. Token presented + valid → authenticated user context
 *   2. No token + !required → solo/demo user context (cached)
 *   3. No token + required → 401 Unauthorized
 *   4. Token presented + invalid + !required → solo/demo fallback
 */

import crypto from "node:crypto";
import { uid } from "../utils";
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import type { AuthConfig } from "../config/schema";
import { UserRole, UserStatus } from "../db/enums";
import type { RequestContext } from "./types";
import { jsonError, HttpStatus, ErrorCode } from "../routes/http-utils";

/**
 * Attempt to authenticate the request.
 *
 * Priority: try token (Bearer header > cookie) first. If valid, return
 * that user's context. Otherwise, fall back to solo/demo user if
 * authConfig.required === false. If auth is required and no valid
 * token is provided, return 401.
 */
export async function authenticate(
  request: Request,
  database: Kysely<DB>,
  authConfig: AuthConfig,
): Promise<Response | { context: RequestContext }> {
  // ── Extract token: Bearer header > cookie fallback ───────
  let rawToken: string | null = null;

  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    rawToken = authHeader.slice("Bearer ".length).trim();
  }

  // Cookie fallback (set by login/demo-login)
  if (!rawToken) {
    const cookieHeader = request.headers.get("Cookie");
    if (cookieHeader) {
      const match = /(?:^|;\s*)ll_token=([^;]+)/.exec(cookieHeader);
      if (match) rawToken = match[1];
    }
  }

  // ── Try token-based auth first (if token presented) ──────
  if (rawToken) {
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const session = await database
      .selectFrom("sessions")
      .select(["id", "user_id", "expires_at"])
      .where("token_hash", "=", tokenHash)
      .executeTakeFirst();

    if (session) {
      // Check expiration
      if (new Date(session.expires_at) < new Date()) {
        await database.deleteFrom("sessions").where("id", "=", session.id).execute();
        // Expired — fall through
      } else {
        // Fetch user role
        const user = await database
          .selectFrom("users")
          .select(["role"])
          .where("id", "=", session.user_id)
          .executeTakeFirst();

        if (user) {
          // Update last activity + last_seen_at (non-blocking)
          try {
            await database
              .updateTable("sessions")
              .set({ last_activity: new Date().toISOString() })
              .where("id", "=", session.id)
              .execute();
            await database
              .updateTable("users")
              .set({ last_seen_at: new Date().toISOString() })
              .where("id", "=", session.user_id)
              .execute();
          } catch {
            /* non-critical */
          }

          return {
            context: {
              userId: session.user_id,
              userRole: user.role,
              sessionId: session.id,
            },
          };
        }

        // User deleted — clean up and fall through
        await database.deleteFrom("sessions").where("id", "=", session.id).execute();
      }
    }
  }

  // ── Fallback: solo mode if auth not required ──────────────
  if (!authConfig.required) {
    const soloUser = await getOrCreateSoloUserForAuth(database, authConfig.demoUsername);
    if (!soloUser) {
      return jsonError("Server misconfigured: no solo user", HttpStatus.InternalServerError);
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
  return jsonError(
    "Missing or invalid Authorization header",
    HttpStatus.Unauthorized,
    ErrorCode.Unauthorized,
  );
}

// ── Solo user helpers ─────────────────────────────────────────

let cachedSoloUser: { id: string } | null | undefined;

/**
 * Get or create the singleton solo/demo user.
 * Cached in-memory after first lookup.
 * Exported for use in routes/auth.ts.
 */
export async function getOrCreateSoloUserForAuth(
  database: Kysely<DB>,
  demoUsername: string,
): Promise<{ id: string } | null> {
  if (cachedSoloUser !== undefined) return cachedSoloUser;

  const existing = await database
    .selectFrom("users")
    .select(["id"])
    .where("role", "=", UserRole.Solo)
    .executeTakeFirst();

  if (existing) {
    cachedSoloUser = existing;
    return existing;
  }

  // Create solo user on first run
  const soloId = uid();
  await database
    .insertInto("users")
    .values({
      id: soloId,
      username: demoUsername,
      display_name: "Solo User",
      role: UserRole.Solo,
      status: UserStatus.Active,
      settings: "{}",
    })
    .execute()
    .catch(() => {
      /* race: another request may have created it — next lookup will find it */
    });

  // Also create actor entry (chat_participants.actor_id references actors.id)
  await database
    .insertInto("actors")
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
    })
    .execute()
    .catch(() => {
      /* race-safe: actor may already exist */
    });

  // Re-fetch (in case of race)
  const created = await database
    .selectFrom("users")
    .select(["id"])
    .where("role", "=", UserRole.Solo)
    .executeTakeFirst();

  // eslint-disable-next-line unicorn/no-top-level-assignment-in-function
  cachedSoloUser = created ?? null;
  return cachedSoloUser;
}

/**
 * Clear the cached solo user reference (for testing).
 */
export function resetSoloUserCache(): void {
  cachedSoloUser = undefined;
}

/**
 * Validate that a session token is well-formed (basic sanity).
 * Returns the raw token string or null.
 */
export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}
