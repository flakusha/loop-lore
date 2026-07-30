/**
 * Auth Routes
 *
 *   POST /api/auth/login      — authenticate, create session, return JWT
 *   POST /api/demo-login      — solo/demo mode login (no password)
 *   POST /api/auth/register   — create account + auto-login
 *   POST /api/auth/logout     — revoke session, clear cookie
 *   GET  /api/auth/me         — current user profile
 *
 * Login form submits form-encoded. On success: HX-Redirect + Set-Cookie.
 * On failure: error HTML for htmx error swap.
 */

import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { signJwt, } from "../auth/jwt";
import type { Config, } from "../config/schema";
import { ensureActorKey, getSmk, isEncryptionEnabled, } from "../crypto";
import { UserRole, UserStatus, } from "../db/enums";
import type { DB, } from "../db/schema";
import type { TranslatorFn, } from "../i18n/types";
import { getOrCreateSoloUserForAuth, } from "../middleware/auth";
import { createRateLimiter, } from "../middleware/rate-limit";
import { jsonParseOr, uid, } from "../utils";
import { notFound, unauthorized, } from "../validation/middleware";
import { HttpStatus, jsonError, jsonResponse, } from "./http-utils";

interface HandleOpts {
  database: Kysely<DB>;
  config: Config;
}

// ── Rate limiting (per-IP, in-memory) ─────────────────────────

const LOGIN_MAX_ATTEMPTS = 10;
const loginLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: LOGIN_MAX_ATTEMPTS, },);

const REGISTER_MAX_ATTEMPTS = 3;
const registerLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: REGISTER_MAX_ATTEMPTS, },);

// ── Cookie helpers ────────────────────────────────────────────

const TOKEN_COOKIE = "ll_token";
const COOKIE_PATH = "/";

function setTokenCookie(token: string, maxAgeSecs: number,): string {
  return `${TOKEN_COOKIE}=${token}; Path=${COOKIE_PATH}; Max-Age=${maxAgeSecs}; HttpOnly; SameSite=Lax`;
}

// ── Helpers ───────────────────────────────────────────────────

function getClientIp(request: Request,): string {
  const directIp = (request as { remoteAddress?: string }).remoteAddress;
  if (directIp) { return directIp; }
  return (
    request.headers.get("X-Forwarded-For",)?.split(",", 1,)[0]?.trim() ??
      request.headers.get("x-real-ip",) ??
      request.headers.get("CF-Connecting-IP",) ??
      "unknown"
  );
}

function escapeHtml(str: string,): string {
  return str
    .replaceAll("&", "&amp;",)
    .replaceAll("<", "&lt;",)
    .replaceAll(">", "&gt;",)
    .replaceAll('"', "&quot;",);
}

function errorHtml(msg: string,): Response {
  return new Response(`<p class="error-msg">${escapeHtml(msg,)}</p>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", },
  },);
}

/** Extract session ID from JWT payload without signature verification (for logout). */
function extractSessionIdFromJwt(token: string,): string | null {
  try {
    const parts = token.split(".",);
    if (parts.length !== 3) { return null; }
    const payloadB64 = parts[1]!;
    const base64 = payloadB64.replaceAll("-", "+",).replaceAll("_", "/",);
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4,);
    const payloadBytes = Uint8Array.from(atob(padded,), (c,) => c.charCodeAt(0,),);
    const payload = jsonParseOr<{ sid?: string }>(new TextDecoder().decode(payloadBytes,), {},);
    return payload.sid ?? null;
  } catch {
    return null;
  }
}

/** Extract user ID from JWT payload without signature verification (for /me). */
function extractUserIdFromJwt(token: string,): string | null {
  try {
    const parts = token.split(".",);
    if (parts.length !== 3) { return null; }
    const payloadB64 = parts[1]!;
    const base64 = payloadB64.replaceAll("-", "+",).replaceAll("_", "/",);
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4,);
    const payloadBytes = Uint8Array.from(atob(padded,), (c,) => c.charCodeAt(0,),);
    const payload = jsonParseOr<{ sub?: string }>(new TextDecoder().decode(payloadBytes,), {},);
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

function getTokenFromCookie(request: Request,): string | null {
  return request.headers
    .get("Cookie",)
    ?.split(";",)
    .find((c,) => c.startsWith("ll_token=",))
    ?.slice(9,) ?? null;
}

// ── Handlers ──────────────────────────────────────────────────

async function handleLogin(
  request: Request,
  database: Kysely<DB>,
  config: Config,
  t?: TranslatorFn,
): Promise<Response> {
  const ip = getClientIp(request,);
  if (!loginLimiter.check(ip,)) {
    return new Response(
      `<p class="error-msg">${t ? t("errors.rateLimited",) : "Too many attempts. Try again later."}</p>`,
      {
        status: HttpStatus.TooManyRequests,
        headers: { "Content-Type": "text/html; charset=utf-8", },
      },
    );
  }

  let formData: URLSearchParams;
  try {
    const text = await request.text();
    formData = new URLSearchParams(text,);
  } catch {
    return jsonError({ message: "errors.badRequest", status: HttpStatus.BadRequest, t, },);
  }

  const username = formData.get("username",)?.trim();
  const password = formData.get("password",);

  if (!username || !password) {
    return errorHtml(t ? t("errors.missingField",) : "Username and password are required.",);
  }

  const user = await database
    .selectFrom("users",)
    .select(["id", "username", "password_hash", "role", "status", "display_name",],)
    .where("username", "=", username,)
    .executeTakeFirst();

  if (!user) { return errorHtml(t ? t("auth.invalidCredentials",) : "Invalid username or password.",); }
  if (user.status === UserStatus.Disabled || user.status === UserStatus.Deactivated) {
    return errorHtml(t ? t("auth.accountLocked",) : "Account is disabled.",);
  }
  if (!user.password_hash) { return errorHtml(t ? t("auth.invalidCredentials",) : "Invalid username or password.",); }

  const passwordValid = await Bun.password.verify(password, user.password_hash,);
  if (!passwordValid) { return errorHtml(t ? t("auth.invalidCredentials",) : "Invalid username or password.",); }

  const userAgent = request.headers.get("User-Agent",);
  const sessionId = uid();

  await database
    .insertInto("sessions",)
    .values({
      id: sessionId,
      user_id: user.id,
      token_hash: "",
      ip,
      user_agent: userAgent,
      expires_at: new Date(Date.now() + config.auth.sessionTimeoutHours * 60 * 60 * 1000,).toISOString(),
    },)
    .execute();

  if (isEncryptionEnabled()) {
    const smk = getSmk()!;
    await ensureActorKey({ database, actorId: user.id, smk, },);
  }

  const jwtSecret = config.auth.jwtSecret;
  if (!jwtSecret) {
    return jsonError({
      message: "errors.serverError",
      status: HttpStatus.InternalServerError,
      t,
    },);
  }

  const jwtExpiresIn = config.auth.jwtExpiresIn ?? 86_400;
  const token = await signJwt({
    secret: jwtSecret,
    userId: user.id,
    role: user.role,
    sessionId,
    expiresInSeconds: jwtExpiresIn,
  },);

  return new Response("OK", {
    status: HttpStatus.OK,
    headers: { "HX-Redirect": "/views/chat", "Set-Cookie": setTokenCookie(token, jwtExpiresIn,), },
  },);
}

async function handleDemoLogin(
  request: Request,
  database: Kysely<DB>,
  config: Config,
  t?: TranslatorFn,
): Promise<Response> {
  const soloUser = await getOrCreateSoloUserForAuth(database, config.auth.demoUsername,);
  if (!soloUser) {
    return jsonError({
      message: "errors.serverError",
      status: HttpStatus.InternalServerError,
      t,
    },);
  }

  const ip = getClientIp(request,);
  const userAgent = request.headers.get("User-Agent",);
  const sessionId = uid();

  await database
    .insertInto("sessions",)
    .values({
      id: sessionId,
      user_id: soloUser.id,
      token_hash: "",
      ip,
      user_agent: userAgent,
      expires_at: new Date(Date.now() + config.auth.sessionTimeoutHours * 60 * 60 * 1000,).toISOString(),
    },)
    .execute();

  if (isEncryptionEnabled()) {
    const smk = getSmk()!;
    await ensureActorKey({ database, actorId: soloUser.id, smk, },);
  }

  const jwtSecret = config.auth.jwtSecret;
  if (!jwtSecret) {
    return jsonError({
      message: t?.("auth.jwtSecretMissing",) ?? "Server misconfigured: JWT secret not set",
      status: HttpStatus.InternalServerError,
    },);
  }

  const jwtExpiresIn = config.auth.jwtExpiresIn ?? 86_400;
  const token = await signJwt({
    secret: jwtSecret,
    userId: soloUser.id,
    role: UserRole.Solo,
    sessionId,
    expiresInSeconds: jwtExpiresIn,
  },);

  return new Response("OK", {
    status: HttpStatus.OK,
    headers: { "HX-Redirect": "/views/chat", "Set-Cookie": setTokenCookie(token, jwtExpiresIn,), },
  },);
}

async function handleRegister(
  request: Request,
  database: Kysely<DB>,
  config: Config,
  t?: TranslatorFn,
): Promise<Response> {
  // Gate: registration must be open
  if (!config.auth.registrationOpen) {
    return errorHtml(t ? t("auth.registrationClosed",) : "Registration is closed.",);
  }

  const ip = getClientIp(request,);
  if (!registerLimiter.check(ip,)) {
    return new Response(
      `<p class="error-msg">${t ? t("errors.rateLimited",) : "Too many registration attempts. Try again later."}</p>`,
      {
        status: HttpStatus.TooManyRequests,
        headers: { "Content-Type": "text/html; charset=utf-8", },
      },
    );
  }

  let formData: URLSearchParams;
  try {
    const text = await request.text();
    formData = new URLSearchParams(text,);
  } catch {
    return errorHtml(t ? t("errors.badRequest",) : "Invalid request body",);
  }

  const username = formData.get("username",)?.trim();
  const password = formData.get("password",);

  if (!username || !password) {
    return errorHtml(t ? t("errors.missingField",) : "Username and password are required.",);
  }

  if (username.length < 3 || username.length > 32) {
    return errorHtml(t ? t("auth.usernameLength",) : "Username must be 3–32 characters.",);
  }

  if (password.length < 6) {
    return errorHtml(t ? t("auth.passwordLength",) : "Password must be at least 6 characters.",);
  }

  const existing = await database
    .selectFrom("users",)
    .select(["id",],)
    .where("username", "=", username,)
    .executeTakeFirst();

  if (existing) {
    return errorHtml(t ? t("auth.usernameTaken",) : "Username already taken.",);
  }

  const passwordHash = await Bun.password.hash(password,);
  const userId = uid();

  await database
    .insertInto("users",)
    .values({
      id: userId,
      username,
      display_name: username,
      password_hash: passwordHash,
      role: UserRole.User,
      status: UserStatus.Active,
      settings: "{}",
    },)
    .execute();

  await database
    .insertInto("actors",)
    .values({
      id: userId,
      actor_type: "user",
      display_name: username,
      user_id: userId,
      owner_id: userId,
      agent_type: "none",
      settings: "{}",
      import_spec: "raw",
      data_source_format: "json",
      data_raw: null,
      data_version: 0,
    },)
    .execute();

  if (isEncryptionEnabled()) {
    const smk = getSmk()!;
    await ensureActorKey({ database, actorId: userId, smk, },);
  }

  const userAgent = request.headers.get("User-Agent",);
  const sessionId = uid();

  await database
    .insertInto("sessions",)
    .values({
      id: sessionId,
      user_id: userId,
      token_hash: "",
      ip,
      user_agent: userAgent,
      expires_at: new Date(Date.now() + config.auth.sessionTimeoutHours * 60 * 60 * 1000,).toISOString(),
    },)
    .execute();

  const jwtSecret = config.auth.jwtSecret;
  if (!jwtSecret) {
    return jsonError({
      message: t?.("auth.jwtSecretMissing",) ?? "Server misconfigured: JWT secret not set",
      status: HttpStatus.InternalServerError,
    },);
  }

  const jwtExpiresIn = config.auth.jwtExpiresIn ?? 86_400;
  const token = await signJwt({
    secret: jwtSecret,
    userId,
    role: UserRole.User,
    sessionId,
    expiresInSeconds: jwtExpiresIn,
  },);

  return new Response("OK", {
    status: HttpStatus.OK,
    headers: { "HX-Redirect": "/views/chat", "Set-Cookie": setTokenCookie(token, jwtExpiresIn,), },
  },);
}

async function handleLogout(request: Request, database: Kysely<DB>,): Promise<Response> {
  const token = getTokenFromCookie(request,);
  const sessionId = token ? extractSessionIdFromJwt(token,) : null;

  if (sessionId) {
    await database.deleteFrom("sessions",).where("id", "=", sessionId,).execute();
  }

  return new Response(null, {
    status: HttpStatus.OK,
    headers: {
      "Set-Cookie": `${TOKEN_COOKIE}=; Path=${COOKIE_PATH}; Max-Age=0; HttpOnly; SameSite=Lax`,
    },
  },);
}

async function handleMe(
  request: Request,
  database: Kysely<DB>,
  derivedUserId: string | null = null,
): Promise<Response> {
  let userId: string | null = derivedUserId;

  if (!userId) {
    const token = getTokenFromCookie(request,);
    userId = token ? extractUserIdFromJwt(token,) : null;
  }

  if (!userId) {
    return unauthorized();
  }

  const user = await database
    .selectFrom("users",)
    .select(["id", "username", "display_name", "role", "created_at", "last_seen_at",],)
    .where("id", "=", userId,)
    .executeTakeFirst();

  if (!user) { return notFound("User not found",); }
  return jsonResponse(user,);
}

// ── Elysia plugins ─────────────────────────────────────

export function authPublicRoutes({ database, config, }: HandleOpts,): Elysia {
  return new Elysia({ name: "auth-public", },)
    .post(
      "/api/auth/login",
      async ({ request, ...rest },) =>
        handleLogin(request, database, config, (rest as any).t as TranslatorFn | undefined,),
    )
    .post(
      "/api/demo-login",
      async ({ request, ...rest },) =>
        handleDemoLogin(request, database, config, (rest as any).t as TranslatorFn | undefined,),
    )
    .post(
      "/api/auth/register",
      async ({ request, ...rest },) =>
        handleRegister(request, database, config, (rest as any).t as TranslatorFn | undefined,),
    ) as unknown as Elysia;
}

export function authProtectedRoutes({ database, }: { database: Kysely<DB> },): Elysia {
  return new Elysia({ name: "auth-protected", },)
    .post("/api/auth/logout", async ({ request, },) => handleLogout(request, database,),)
    .get(
      "/api/auth/me",
      async ({ request, ...rest },) => handleMe(request, database, (rest as any).userId as string | null | undefined,),
    ) as unknown as Elysia;
}

// ── Test utilities ───────────────────────────────────────────

export function resetLoginRateLimiter(): void {
  loginLimiter.clear();
}

export function resetRegisterRateLimiter(): void {
  registerLimiter.clear();
}

export { resetSoloUserCache as resetSoloUserCacheForAuth, } from "../middleware/auth";
