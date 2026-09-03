// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { ensureActorKey, getSmk, isEncryptionEnabled, } from "../../crypto";
import { UserRole, UserStatus, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { TranslatorFn, } from "../../i18n/types";
import { uid, } from "../../utils";
import { createSessionAndCookie, } from "./session";
import { errorHtml, getClientIp, parseCredentials, rateLimitHtml, registerLimiter, } from "./shared";

/**
 * Hash the password and insert the user row + mirror actor.
 * @param database
 * @param username
 * @param password
 */
async function insertRegisteredUser(
  database: Kysely<DB>,
  username: string,
  password: string,
): Promise<string> {
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
      format_version: 0,
    },)
    .execute();

  if (isEncryptionEnabled()) {
    const smk = getSmk()!;
    await ensureActorKey({ database, actorId: userId, smk, },);
  }
  return userId;
}

/**
 * Enforce registration-open + rate-limit gates.
 * @param config
 * @param ip
 * @param t
 */
function checkRegisterGate(
  config: Config,
  ip: string,
  t: TranslatorFn | undefined,
): Response | null {
  if (!config.auth.registrationOpen) {
    return errorHtml(t ? t("auth.registrationClosed",) : "Registration is closed.",);
  }
  // BUG-429-responses-omit-retry-after-and-x-ratelimit-headers: emit headers.
  const regLimit = registerLimiter.consume(ip,);
  if (!regLimit.allowed) {
    return rateLimitHtml({
      limit: regLimit,
      t,
      fallbackMessage: "Too many registration attempts. Try again later.",
    },);
  }
  return null;
}

/**
 * @param request
 * @param database
 * @param config
 * @param t
 * @param peerIp
 */
async function handleRegister(
  request: Request,
  database: Kysely<DB>,
  config: Config,
  t?: TranslatorFn,
  peerIp?: string | null,
): Promise<Response> {
  const ip = getClientIp(request, config, peerIp ?? null,);
  const gateError = checkRegisterGate(config, ip, t,);
  if (gateError) { return gateError; }

  const formData = await parseCredentials(request,);
  if (!formData) { return errorHtml(t ? t("errors.badRequest",) : "Invalid request body",); }

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

  const userId = await insertRegisteredUser(database, username, password,);
  return createSessionAndCookie(request, database, config, userId, UserRole.User, ip, t,);
}

export { handleRegister, };
