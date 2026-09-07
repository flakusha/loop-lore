// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { ensureActorKey, getSmk, isEncryptionEnabled, } from "../../crypto";
import { UserRole, UserStatus, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { TranslatorFn, } from "../../i18n/types";
import { getOrCreateSoloUserForAuth, } from "../../middleware/auth";
import type { RateLimiter, } from "../../middleware/rate-limit";
import { HttpStatus, jsonError, } from "../http-utils";
import { createSessionAndCookie, } from "./session";
import {
  demoLoginLimiter,
  errorHtml,
  getClientIp,
  loginLimiter,
  parseCredentials,
  rateLimitHtml,
} from "./shared";

/**
 * @param request
 * @param database
 * @param config
 * @param t
 * @param peerIp
 * @param limiter Optional per-call limiter override (tests); defaults to the
 *   module singleton.
 */
async function handleLogin(
  request: Request,
  database: Kysely<DB>,
  config: Config,
  t?: TranslatorFn,
  peerIp?: string | null,
  limiter: RateLimiter = loginLimiter,
): Promise<Response> {
  const ip = getClientIp(request, config, peerIp ?? null,);
  // BUG-429-responses-omit-retry-after-and-x-ratelimit-headers: emit
  // X-RateLimit-* + Retry-After so well-behaved clients back off correctly.
  const loginLimit = limiter.consume(ip,);
  if (!loginLimit.allowed) {
    return rateLimitHtml({
      limit: loginLimit,
      t,
      fallbackMessage: "Too many attempts. Try again later.",
    },);
  }

  const formData = await parseCredentials(request,);

  if (!formData) {
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

  if (isEncryptionEnabled()) {
    const smk = getSmk()!;
    await ensureActorKey({ database, actorId: user.id, smk, },);
  }

  return createSessionAndCookie(request, database, config, user.id, user.role, ip, t,);
}

/**
 * @param request
 * @param database
 * @param config
 * @param t
 * @param peerIp
 * @param limiter Optional per-call limiter override (tests); defaults to the
 *   module singleton.
 */
async function handleDemoLogin(
  request: Request,
  database: Kysely<DB>,
  config: Config,
  t?: TranslatorFn,
  peerIp?: string | null,
  limiter: RateLimiter = demoLoginLimiter,
): Promise<Response> {
  const ip = getClientIp(request, config, peerIp ?? null,);
  // BUG-demo-login-endpoint-bypasses-rate-limiter: enforce the same per-IP
  // gate as /api/auth/login. Without this, an attacker can spam session
  // creation (one DB row per request) and exhaust the sessions table.
  const demoLimit = limiter.consume(ip,);
  if (!demoLimit.allowed) {
    return rateLimitHtml({
      limit: demoLimit,
      t,
      fallbackMessage: "Too many attempts. Try again later.",
    },);
  }

  const soloUser = await getOrCreateSoloUserForAuth(database, config.auth.demoUsername,);
  if (!soloUser) {
    return jsonError({
      message: "errors.serverError",
      status: HttpStatus.InternalServerError,
      t,
    },);
  }

  if (isEncryptionEnabled()) {
    const smk = getSmk()!;
    await ensureActorKey({ database, actorId: soloUser.id, smk, },);
  }

  // Sessions now go through the shared creator: the demo user gains the same
  // maxSessionsPerUser eviction as every other account (previously demo
  // session rows grew unbounded).
  return createSessionAndCookie(request, database, config, soloUser.id, UserRole.Solo, ip, t,);
}

export { handleDemoLogin, handleLogin, };
