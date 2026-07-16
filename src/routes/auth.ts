/**
 * Auth Routes
 *
 *   POST /api/auth/login      — authenticate, create session, return token
 *   POST /api/demo-login      — solo/demo mode login (no password)
 *   POST /api/auth/logout     — delete current session
 *   GET  /api/auth/me         — current user profile
 *
 * Login form submits form-encoded. On success: HX-Redirect + Set-Cookie.
 * On failure: error HTML for htmx error swap.
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */

import crypto from "node:crypto";
import { Elysia } from "elysia";
import { uid, secureToken } from "../utils";
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import type { Config } from "../config/schema";
import type { RouteDispatchParams } from "./router";
import { UserStatus } from "../db/enums";
import { jsonResponse, jsonError, HttpStatus, ErrorCode } from "./http-utils";
import { getOrCreateSoloUserForAuth } from "../middleware/auth";
import { createRateLimiter } from "../middleware/rate-limit";
import { getSmk, isEncryptionEnabled, ensureActorKey } from "../crypto";

type HandleOpts = { database: Kysely<DB>; config: Config };

// ── Rate limiting (per-IP, in-memory) ─────────────────────────

const LOGIN_MAX_ATTEMPTS = 10;
const loginLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: LOGIN_MAX_ATTEMPTS });

// ── Cookie helpers ────────────────────────────────────────────

const TOKEN_COOKIE = "ll_token";
const COOKIE_PATH = "/";
const COOKIE_MAX_AGE_SECS = 24 * 60 * 60; // 24h

function setTokenCookie(token: string): string {
  return `${TOKEN_COOKIE}=${token}; Path=${COOKIE_PATH}; Max-Age=${COOKIE_MAX_AGE_SECS}; HttpOnly; SameSite=Lax; Secure`;
}

// ── Helpers ───────────────────────────────────────────────────

function getClientIp(request: Request): string {
  const directIp = (request as { remoteAddress?: string }).remoteAddress;
  if (directIp) return directIp;
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

// ── Handlers ──────────────────────────────────────────────────

async function handleLogin(request: Request, database: Kysely<DB>, config: Config): Promise<Response> {
  const ip = getClientIp(request);
  if (!loginLimiter.check(ip)) {
    return new Response('<p class="error-msg">Too many attempts. Try again later.</p>', {
      status: HttpStatus.TooManyRequests,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  let formData: URLSearchParams;
  try {
    const text = await request.text();
    formData = new URLSearchParams(text);
  } catch {
    return jsonError({ message: "Invalid request body", status: HttpStatus.BadRequest });
  }

  const username = formData.get("username")?.trim();
  const password = formData.get("password");

  if (!username || !password) {
    return errorHtml("Username and password are required.");
  }

  const user = await database
    .selectFrom("users")
    .select(["id", "username", "password_hash", "role", "status", "display_name"])
    .where("username", "=", username)
    .executeTakeFirst();

  if (!user) return errorHtml("Invalid username or password.");
  if (user.status === UserStatus.Disabled || user.status === UserStatus.Deactivated) {
    return errorHtml("Account is disabled.");
  }
  if (!user.password_hash) return errorHtml("Invalid username or password.");

  const passwordValid = await Bun.password.verify(password, user.password_hash);
  if (!passwordValid) return errorHtml("Invalid username or password.");

  const userAgent = request.headers.get("User-Agent");
  const rawToken = secureToken();
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  await database
    .insertInto("sessions")
    .values({
      id: uid(),
      user_id: user.id,
      token_hash: tokenHash,
      ip,
      user_agent: userAgent,
      expires_at: computeExpiry(config.auth.sessionTimeoutHours),
    })
    .execute();

  if (isEncryptionEnabled()) {
    const smk = getSmk()!;
    await ensureActorKey({ database, actorId: user.id, smk });
  }

  return new Response(null, {
    status: HttpStatus.OK,
    headers: { "HX-Redirect": "/views/chat", "Set-Cookie": setTokenCookie(rawToken) },
  });
}

async function handleDemoLogin(request: Request, database: Kysely<DB>, config: Config): Promise<Response> {
  const soloUser = await getOrCreateSoloUserForAuth(database, config.auth.demoUsername);
  if (!soloUser) {
    return jsonError({
      message: "Server misconfigured: no solo user",
      status: HttpStatus.InternalServerError,
    });
  }

  const ip = getClientIp(request);
  const userAgent = request.headers.get("User-Agent");
  const rawToken = secureToken();
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  await database
    .insertInto("sessions")
    .values({
      id: uid(),
      user_id: soloUser.id,
      token_hash: tokenHash,
      ip,
      user_agent: userAgent,
      expires_at: computeExpiry(config.auth.sessionTimeoutHours),
    })
    .execute();

  if (isEncryptionEnabled()) {
    const smk = getSmk()!;
    await ensureActorKey({ database, actorId: soloUser.id, smk });
  }

  return new Response(null, {
    status: HttpStatus.OK,
    headers: { "HX-Redirect": "/views/chat", "Set-Cookie": setTokenCookie(rawToken) },
  });
}

async function handleLogout(request: Request, database: Kysely<DB>): Promise<Response> {
  const token = request.headers
    .get("Cookie")
    ?.split(";")
    .find((c) => c.startsWith("ll_token="))
    ?.slice(9);
  const sessionId = token ? await getSessionIdFromToken(database, token) : null;

  if (!sessionId) {
    return new Response(null, {
      status: HttpStatus.OK,
      headers: {
        "Set-Cookie": `${TOKEN_COOKIE}=; Path=${COOKIE_PATH}; Max-Age=0; HttpOnly; SameSite=Lax; Secure`,
      },
    });
  }

  await database.deleteFrom("sessions").where("id", "=", sessionId).execute();
  return jsonResponse({ ok: true }, HttpStatus.OK);
}

async function getSessionIdFromToken(database: Kysely<DB>, token: string): Promise<string | null> {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const session = await database
    .selectFrom("sessions")
    .select("id")
    .where("token_hash", "=", tokenHash)
    .executeTakeFirst();
  return session?.id ?? null;
}

async function handleMe(request: Request, database: Kysely<DB>): Promise<Response> {
  const token = request.headers
    .get("Cookie")
    ?.split(";")
    .find((c) => c.startsWith("ll_token="))
    ?.slice(9);
  const sessionId = token ? await getSessionIdFromToken(database, token) : null;

  if (!sessionId) {
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });
  }

  const session = await database
    .selectFrom("sessions")
    .select("user_id")
    .where("id", "=", sessionId)
    .executeTakeFirst();
  if (!session) {
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });
  }

  const user = await database
    .selectFrom("users")
    .select(["id", "username", "display_name", "role", "created_at", "last_seen_at"])
    .where("id", "=", session.user_id)
    .executeTakeFirst();

  if (!user)
    return jsonError({ message: "User not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });
  return jsonResponse(user);
}

// ── Elysia plugins ─────────────────────────────────────

export function authPublicRoutes({ database, config }: HandleOpts): Elysia {
  return new Elysia({ name: "auth-public" })
    .post("/api/auth/login", async ({ request }) => handleLogin(request, database, config))
    .post("/api/demo-login", async ({ request }) => handleDemoLogin(request, database, config));
}

export function authProtectedRoutes({ database }: { database: Kysely<DB> }): Elysia {
  return new Elysia({ name: "auth-protected" })
    .post("/api/auth/logout", async ({ request }) => handleLogout(request, database))
    .get("/api/auth/me", async ({ request }) => handleMe(request, database));
}

// ── Backward compat: dispatchAuth for server.ts ───────────────────────────────────────────

export async function dispatchAuth(params: RouteDispatchParams): Promise<Response | null> {
  const { request, database, config } = params;
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
    return handleLogout(request, database);
  }
  // GET /api/auth/me
  if (pathname === "/api/auth/me" && method === "GET") {
    return handleMe(request, database);
  }
  return null;
}

// ── Test utilities ───────────────────────────────────────────

export function resetLoginRateLimiter(): void {
  loginLimiter.clear();
}

export { resetSoloUserCache as resetSoloUserCacheForAuth } from "../middleware/auth";
