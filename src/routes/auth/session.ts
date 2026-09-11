// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { signJwt, } from "../../auth/jwt";
import type { Config, } from "../../config/schema";
import { UserRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { TranslatorFn, } from "../../i18n/types";
import { uid, } from "../../utils";
import { notFound, unauthorized, } from "../../validation/middleware";
import { HttpStatus, jsonError, jsonResponse, } from "../http-utils";
import {
  COOKIE_PATH,
  setTokenCookie,
  TOKEN_COOKIE,
} from "./shared";

/**
 * Create a session row, enforce maxSessionsPerUser cap, sign a JWT, and return
 * the redirect response.
 *
 * Shared by login, registration and demo login (dedup: this was a byte-for-byte
 * clone in login.ts and register.ts). The JWT-misconfiguration branch uses the
 * precise `auth.jwtSecretMissing` message across all three call sites.
 * @param request
 * @param database
 * @param config
 * @param userId
 * @param role
 * @param ip
 * @param t
 */
async function createSessionAndCookie(
  request: Request,
  database: Kysely<DB>,
  config: Config,
  userId: string,
  role: UserRole,
  ip: string,
  t: TranslatorFn | undefined,
): Promise<Response> {
  const userAgent = request.headers.get("User-Agent",);
  const sessionId = uid();

  // Enforce maxSessionsPerUser cap: evict oldest session if at limit
  const maxSessions = config.auth.maxSessionsPerUser ?? 10;
  const existingCount = await database
    .selectFrom("sessions",)
    .select(database.fn.countAll().as("cnt",),)
    .where("user_id", "=", userId,)
    .executeTakeFirst();
  const cnt = Number(existingCount?.cnt ?? 0,);
  if (cnt >= maxSessions) {
    // Evict the oldest session by id (lowest id = oldest auto-increment)
    await database
      .deleteFrom("sessions",)
      .where("user_id", "=", userId,)
      .orderBy("id", "asc",)
      .limit(1,)
      .execute();
  }

  await database
    .insertInto("sessions",)
    .values({
      id: sessionId,
      user_id: userId,
      token_hash: `jwt:${sessionId}`,
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
    role,
    sessionId,
    expiresInSeconds: jwtExpiresIn,
  },);

  return new Response("OK", {
    status: HttpStatus.OK,
    headers: { "HX-Redirect": "/views/chat", "Set-Cookie": setTokenCookie(token, jwtExpiresIn,), },
  },);
}

/**
 * @param request
 * @param database
 * @param derivedUserId
 * @param derivedSessionId
 */
async function handleLogout(
  request: Request,
  database: Kysely<DB>,
  derivedUserId: string | null = null,
  derivedSessionId: string | null = null,
): Promise<Response> {
  // SECURITY: only delete the session row when both the userId and sessionId
  // came from the authenticated middleware (signature-verified JWT + DB-bound
  // session). Previously logout parsed `sid` from an unverified JWT cookie,
  // so a forged token + known session id was a logout DoS.
  void request;
  if (derivedUserId && derivedSessionId) {
    await database
      .deleteFrom("sessions",)
      .where("id", "=", derivedSessionId,)
      .where("user_id", "=", derivedUserId,)
      .execute();
  }

  return new Response(null, {
    status: HttpStatus.OK,
    headers: {
      "Set-Cookie": `${TOKEN_COOKIE}=; Path=${COOKIE_PATH}; Max-Age=0; HttpOnly; SameSite=Lax`,
    },
  },);
}

/**
 * @param request
 * @param database
 * @param derivedUserId
 */
async function handleMe(
  request: Request,
  database: Kysely<DB>,
  derivedUserId: string | null = null,
): Promise<Response> {
  // SECURITY: only trust userId from the authenticated middleware path.
  // Falling back to a base64 decode of the cookie (no signature check) allowed
  // impersonation by anyone who could set a cookie with a chosen `sub`.
  // The route is mounted on authProtectedRoutes so the middleware runs first;
  // if it failed to bind a userId the response is 401, not "trust the cookie".
  void request;
  if (!derivedUserId) {
    return unauthorized();
  }

  const user = await database
    .selectFrom("users",)
    .select(["id", "username", "display_name", "role", "created_at", "last_seen_at",],)
    .where("id", "=", derivedUserId,)
    .executeTakeFirst();

  if (!user) { return notFound("User not found",); }
  return jsonResponse(user,);
}

/**
 * Session metadata returned by GET /api/sessions. Never includes token_hash.
 */
export interface SessionMetadata {
  id: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  last_activity: string;
  expires_at: string;
  current: boolean;
}

/**
 * @param expiresAt
 */
function isSessionExpired(expiresAt: string,): boolean {
  const exp = Date.parse(expiresAt,);
  return !Number.isFinite(exp,) || exp <= Date.now();
}

/**
 * @param request
 * @param database
 * @param derivedUserId
 * @param derivedSessionId
 */
async function handleListSessions(
  request: Request,
  database: Kysely<DB>,
  derivedUserId: string | null = null,
  derivedSessionId: string | null = null,
): Promise<Response> {
  void request;
  if (!derivedUserId) {
    return unauthorized();
  }
  const rows = await database
    .selectFrom("sessions",)
    .select(["id", "ip", "user_agent", "created_at", "last_activity", "expires_at",],)
    .where("user_id", "=", derivedUserId,)
    .orderBy("last_activity", "desc",)
    .execute();
  const sessions: SessionMetadata[] = rows.map((row,) => ({
    id: row.id,
    ip: row.ip,
    user_agent: row.user_agent,
    created_at: row.created_at,
    last_activity: row.last_activity,
    expires_at: row.expires_at,
    current: row.id === derivedSessionId,
  }));
  return jsonResponse({ sessions, },);
}

/**
 * @param request
 * @param database
 * @param derivedUserId
 * @param derivedSessionId
 * @param sessionId
 */
async function handleRevokeSession(
  request: Request,
  database: Kysely<DB>,
  derivedUserId: string | null = null,
  derivedSessionId: string | null = null,
  sessionId = "",
): Promise<Response> {
  void request;
  if (!derivedUserId) {
    return unauthorized();
  }
  if (!sessionId) {
    return jsonError({ message: "Session not found", status: HttpStatus.NotFound, },);
  }
  if (sessionId === derivedSessionId) {
    return jsonError({
      message: "Cannot revoke the current session; use logout instead",
      status: HttpStatus.BadRequest,
    },);
  }
  const row = await database
    .selectFrom("sessions",)
    .select(["id", "expires_at",],)
    .where("id", "=", sessionId,)
    .where("user_id", "=", derivedUserId,)
    .executeTakeFirst();
  if (!row) {
    return jsonError({ message: "Session not found", status: HttpStatus.NotFound, },);
  }
  if (isSessionExpired(row.expires_at,)) {
    await database.deleteFrom("sessions",).where("id", "=", sessionId,).execute();
    return jsonError({ message: "Session expired", status: HttpStatus.Gone, },);
  }
  await database
    .deleteFrom("sessions",)
    .where("id", "=", sessionId,)
    .where("user_id", "=", derivedUserId,)
    .execute();
  return jsonResponse({ ok: true, },);
}

/**
 * @param request
 * @param database
 * @param config
 * @param derivedUserId
 * @param derivedSessionId
 * @param sessionId
 */
async function handleSwitchSession(
  request: Request,
  database: Kysely<DB>,
  config: Config,
  derivedUserId: string | null = null,
  derivedSessionId: string | null = null,
  sessionId = "",
): Promise<Response> {
  void request;
  void derivedSessionId;
  if (!derivedUserId) {
    return unauthorized();
  }
  if (!sessionId) {
    return jsonError({ message: "Session not found", status: HttpStatus.NotFound, },);
  }
  const row = await database
    .selectFrom("sessions",)
    .select(["id", "expires_at",],)
    .where("id", "=", sessionId,)
    .where("user_id", "=", derivedUserId,)
    .executeTakeFirst();
  if (!row) {
    return jsonError({ message: "Session not found", status: HttpStatus.NotFound, },);
  }
  if (isSessionExpired(row.expires_at,)) {
    await database.deleteFrom("sessions",).where("id", "=", sessionId,).execute();
    return jsonError({ message: "Session expired", status: HttpStatus.Gone, },);
  }
  const user = await database
    .selectFrom("users",)
    .select(["id", "role",],)
    .where("id", "=", derivedUserId,)
    .executeTakeFirst();
  if (!user) {
    return jsonError({ message: "Session not found", status: HttpStatus.NotFound, },);
  }
  const jwtSecret = config.auth.jwtSecret;
  if (!jwtSecret) {
    return jsonError({
      message: "Server misconfigured: JWT secret not set",
      status: HttpStatus.InternalServerError,
    },);
  }
  await database
    .updateTable("sessions",)
    .set({ last_activity: new Date().toISOString(), },)
    .where("id", "=", sessionId,)
    .execute();
  // Mirror createSessionAndCookie: sign a JWT bound to the target session and
  // rotate the session cookie to it with the same cookie mechanics.
  const jwtExpiresIn = config.auth.jwtExpiresIn ?? 86_400;
  const token = await signJwt({
    secret: jwtSecret,
    userId: derivedUserId,
    role: user.role,
    sessionId,
    expiresInSeconds: jwtExpiresIn,
  },);
  return new Response("OK", {
    status: HttpStatus.OK,
    headers: { "HX-Redirect": "/views/chat", "Set-Cookie": setTokenCookie(token, jwtExpiresIn,), },
  },);
}

export {
  createSessionAndCookie,
  handleListSessions,
  handleLogout,
  handleMe,
  handleRevokeSession,
  handleSwitchSession,
};
