/**
 * Auth Routes
 *
 *   POST /api/auth/login      — authenticate, create session, return token
 *   POST /api/demo-login      — solo/demo mode login (no password)
 *   POST /api/auth/logout     — delete current session
 *   GET  /api/auth/me         — current user profile
 *
 * Login form submits form-encoded. On success: HX-Redirect + Set-Cookie.
 * On failure: error HTML for hx-target swap.
 */

import crypto from "node:crypto";
import { uid } from "../utils";
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import type { RequestContext } from "../middleware/types";
import type { Config } from "../config/schema";
import type { RouteDispatchParams } from "./router";
import { UserStatus } from "../db/enums";
import { jsonResponse, jsonError, HttpStatus, ErrorCode } from "./http-utils";
import { getOrCreateSoloUserForAuth } from "../middleware/auth";
import { createRateLimiter } from "../middleware/rate-limit";
import { getSmk, isEncryptionEnabled, ensureActorKey } from "../crypto";

// ── Rate limiting (per-IP, in-memory) ─────────────────────────

const LOGIN_MAX_ATTEMPTS = 10;
const loginLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: LOGIN_MAX_ATTEMPTS });

// ── Cookie helpers ────────────────────────────────────────────

const TOKEN_COOKIE = "ll_token";
const COOKIE_PATH = "/";
const COOKIE_MAX_AGE_SECS = 24 * 60 * 60; // 24h (matches session timeout default)

function setTokenCookie(token: string): string {
  // httpOnly to prevent XSS access, SameSite=Lax for htmx redirects
  return `${TOKEN_COOKIE}=${token}; Path=${COOKIE_PATH}; Max-Age=${COOKIE_MAX_AGE_SECS}; HttpOnly; SameSite=Lax; Secure`;
}

// ── Helpers ───────────────────────────────────────────────────

function getClientIp(request: Request): string {
  // Prefer direct connection IP when available; X-Forwarded-For trust limited to reverse proxy setups
  const directIp = (request as { remoteAddress?: string }).remoteAddress;
  if (directIp) return directIp;
  // Note: X-Forwarded-For can be spoofed by clients not behind trusted proxy
  return (
    request.headers.get("X-Forwarded-For")?.split(",", 1)[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    request.headers.get("CF-Connecting-IP") ??
    "unknown"
  );
}

function computeExpiry(sessionTimeoutHours: number): string {
  return new Date(Date.now() + sessionTimeoutHours * 60 * 60 * 1000).toISOString();
}

function escapeHtml(str: string): string {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function errorHtml(msg: string): Response {
  return new Response(`<p class="error-msg">${escapeHtml(msg)}</p>`, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * Create a session and return the raw token.
 */
async function createSession(
  database: Kysely<DB>,
  userId: string,
  ip: string | null,
  userAgent: string | null,
  maxSessions: number,
  sessionTimeoutHours: number,
): Promise<string> {
  // Enforce max sessions per user
  const sessionCount = await database
    .selectFrom("sessions")
    .select(database.fn.countAll<number>().as("count"))
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (sessionCount && sessionCount.count >= maxSessions) {
    // Evict oldest session
    await database
      .deleteFrom("sessions")
      .where("user_id", "=", userId)
      .where("id", "in", (qb) =>
        qb
          .selectFrom("sessions")
          .select("id")
          .where("user_id", "=", userId)
          .orderBy("last_activity", "asc")
          .limit(1),
      )
      .execute();
  }

  const rawToken = uid();
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  await database
    .insertInto("sessions")
    .values({
      id: uid(),
      user_id: userId,
      token_hash: tokenHash,
      ip,
      user_agent: userAgent,
      expires_at: computeExpiry(sessionTimeoutHours),
    })
    .execute();

  return rawToken;
}

// ── Route handlers ────────────────────────────────────────────

async function handleLogin(request: Request, database: Kysely<DB>, config: Config): Promise<Response> {
  // Rate limit
  const ip = getClientIp(request);
  if (!loginLimiter.check(ip)) {
    return new Response('<p class="error-msg">Too many attempts. Try again later.</p>', {
      status: HttpStatus.TooManyRequests,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Parse form-encoded body
  let formData: URLSearchParams;
  try {
    const text = await request.text();
    formData = new URLSearchParams(text);
  } catch {
    return jsonError("Invalid request body", HttpStatus.BadRequest);
  }

  const username = formData.get("username")?.trim();
  const password = formData.get("password");

  if (!username || !password) {
    return errorHtml("Username and password are required.");
  }

  // Lookup user
  const user = await database
    .selectFrom("users")
    .select(["id", "username", "password_hash", "role", "status", "display_name"])
    .where("username", "=", username)
    .executeTakeFirst();

  if (!user) {
    return errorHtml("Invalid username or password.");
  }

  // Check status
  if (user.status === UserStatus.Disabled || user.status === UserStatus.Deactivated) {
    return errorHtml("Account is disabled.");
  }

  // Verify password
  if (!user.password_hash) {
    return errorHtml("Invalid username or password.");
  }

  const passwordValid = await Bun.password.verify(password, user.password_hash);
  if (!passwordValid) {
    return errorHtml("Invalid username or password.");
  }

  // Create session
  const userAgent = request.headers.get("User-Agent");
  const token = await createSession(
    database,
    user.id,
    ip,
    userAgent,
    config.auth.maxSessionsPerUser,
    config.auth.sessionTimeoutHours,
  );

  // Ensure the user's actor has an encryption key (if encryption enabled)
  if (isEncryptionEnabled()) {
    const smk = getSmk()!;
    await ensureActorKey(database, user.id, smk);
  }

  // Return HX-Redirect + Set-Cookie
  return new Response(null, {
    status: HttpStatus.OK,
    headers: {
      "HX-Redirect": "/views/chat",
      "Set-Cookie": setTokenCookie(token),
    },
  });
}

async function handleDemoLogin(request: Request, database: Kysely<DB>, config: Config): Promise<Response> {
  // Get or create solo user (reuse logic from auth middleware)
  const soloUser = await getOrCreateSoloUserForAuth(database, config.auth.demoUsername);
  if (!soloUser) {
    return jsonError("Server misconfigured: no solo user", HttpStatus.InternalServerError);
  }

  // Create session
  const ip = getClientIp(request);
  const userAgent = request.headers.get("User-Agent");
  const token = await createSession(
    database,
    soloUser.id,
    ip,
    userAgent,
    config.auth.maxSessionsPerUser,
    config.auth.sessionTimeoutHours,
  );

  // Ensure the solo user's actor has an encryption key
  if (isEncryptionEnabled()) {
    const smk = getSmk()!;
    await ensureActorKey(database, soloUser.id, smk);
  }

  // Return redirect to chat page (hx-target="body" hx-swap="outerHTML")
  return new Response(null, {
    status: HttpStatus.OK,
    headers: {
      "HX-Redirect": "/views/chat",
      "Set-Cookie": setTokenCookie(token),
    },
  });
}

async function handleLogout(
  request: Request,
  database: Kysely<DB>,
  context: RequestContext,
): Promise<Response> {
  if (!context.sessionId) {
    // Solo mode or no session — clear cookie
    return new Response(null, {
      status: HttpStatus.OK,
      headers: {
        "Set-Cookie": `${TOKEN_COOKIE}=; Path=${COOKIE_PATH}; Max-Age=0; HttpOnly; SameSite=Lax; Secure`,
      },
    });
  }

  await database.deleteFrom("sessions").where("id", "=", context.sessionId).execute();

  return jsonResponse({ ok: true }, HttpStatus.OK);
}

async function handleMe(database: Kysely<DB>, context: RequestContext): Promise<Response> {
  if (!context.userId) {
    return jsonError("Unauthorized", HttpStatus.Unauthorized, ErrorCode.Unauthorized);
  }

  const user = await database
    .selectFrom("users")
    .select(["id", "username", "display_name", "role", "created_at", "last_seen_at"])
    .where("id", "=", context.userId)
    .executeTakeFirst();

  if (!user) return jsonError("User not found", HttpStatus.NotFound, ErrorCode.NotFound);
  return jsonResponse(user);
}

// ── Dispatch ──────────────────────────────────────────────────

/**
 * Auth route dispatch. Called from server.ts handleApiRequest.
 * Returns Response on match, null to pass through.
 */
export async function dispatchAuth(params: RouteDispatchParams): Promise<Response | null> {
  const { request, context, database, config } = params;
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;

  // POST /api/auth/login
  if (pathname === "/api/auth/login" && method === "POST") {
    return handleLogin(request, database, config);
  }

  // POST /api/demo-login
  if (pathname === "/api/demo-login" && method === "POST") {
    return handleDemoLogin(request, database, config);
  }

  // POST /api/auth/logout
  if (pathname === "/api/auth/logout" && method === "POST") {
    return handleLogout(request, database, context);
  }

  // GET /api/auth/me
  if (pathname === "/api/auth/me" && method === "GET") {
    return handleMe(database, context);
  }

  return null; // Not an auth route
}

/**
 * Clear the cached solo user reference (for testing).
 * Re-exported from middleware/auth.ts.
 */
export { resetSoloUserCache as resetSoloUserCacheForAuth } from "../middleware/auth";
