/**
 * Auth middleware — session token extraction & validation.
 *
 * Two modes:
 *   1. Remote auth (config.auth.required === true)
 *      Extracts Bearer token → SHA-256 hash → sessions table lookup → user role fetch
 *   2. Solo/demo mode (config.auth.required === false)
 *      Bypasses token check. Returns implicit solo user context.
 *      Solo user is looked up once, not per-request.
 */

import crypto from "node:crypto";
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import type { AuthConfig } from "../config/schema";
import { UserRole } from "../db/enums";
import type { RequestContext } from "./types";
import { jsonError, HttpStatus } from "../routes/http-utils";

/**
 * Attempt to authenticate the request.
 *
 * Returns a populated RequestContext on success, or a 401 Response if
 * auth is required but the token is missing/invalid/expired.
 *
 * In solo/demo mode, always returns the solo user context without
 * inspecting the Authorization header.
 */
export async function authenticate(
  request: Request,
  database: Kysely<DB>,
  authConfig: AuthConfig,
): Promise<Response | { context: RequestContext }> {
  // ── Solo/demo mode — skip token check ─────────────────────
  if (!authConfig.required) {
    const soloUser = await getOrCreateSoloUser(database);
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

  // ── Remote auth — extract Bearer token ────────────────────
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonError("Missing or invalid Authorization header", HttpStatus.Unauthorized, "UNAUTHORIZED");
  }

  const rawToken = authHeader.slice("Bearer ".length).trim();
  if (!rawToken) {
    return jsonError("Empty token", HttpStatus.Unauthorized, "UNAUTHORIZED");
  }

  // ── Hash token & look up session ──────────────────────────
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const session = await database
    .selectFrom("sessions")
    .select(["id", "user_id", "expires_at"])
    .where("token_hash", "=", tokenHash)
    .executeTakeFirst();

  if (!session) {
    return jsonError("Invalid session token", HttpStatus.Unauthorized, "UNAUTHORIZED");
  }

  // ── Check expiration ──────────────────────────────────────
  if (new Date(session.expires_at) < new Date()) {
    // Clean up expired session
    await database.deleteFrom("sessions").where("id", "=", session.id).execute();
    return jsonError("Session expired", HttpStatus.Unauthorized, "UNAUTHORIZED");
  }

  // ── Fetch user role ───────────────────────────────────────
  const user = await database
    .selectFrom("users")
    .select(["role"])
    .where("id", "=", session.user_id)
    .executeTakeFirst();

  if (!user) {
    // Session references deleted user — clean up
    await database.deleteFrom("sessions").where("id", "=", session.id).execute();
    return jsonError("User not found", HttpStatus.Unauthorized, "UNAUTHORIZED");
  }

  // ── Update last activity + last_seen_at (non-blocking) ────
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
    /* non-critical updates — silent */
  }

  return {
    context: {
      userId: session.user_id,
      userRole: user.role,
      sessionId: session.id,
    },
  };
}

// ── Solo user helpers ─────────────────────────────────────────

let cachedSoloUser: { id: string } | null | undefined;

/**
 * Get or create the singleton solo/demo user.
 * Cached in-memory after first lookup.
 */
async function getOrCreateSoloUser(database: Kysely<DB>): Promise<{ id: string } | null> {
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
  const soloId = crypto.randomUUID();
  await database
    .insertInto("users")
    .values({
      id: soloId,
      username: "solo",
      display_name: "Solo User",
      role: UserRole.Solo,
      settings: "{}",
    })
    .execute()
    .catch(() => {
      /* race: another request may have created it — next lookup will find it */
    });

  // Re-fetch (in case of race)
  const created = await database
    .selectFrom("users")
    .select(["id"])
    .where("role", "=", UserRole.Solo)
    .executeTakeFirst();

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
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}
