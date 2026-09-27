// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { ensureActorKey, getSmk, isEncryptionEnabled, } from "../../crypto";
import { UserRole, UserStatus, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { insertUnique, } from "../../db/upsert-helpers";
import type { TranslatorFn, } from "../../i18n/types";
import type { RateLimiter, } from "../../middleware/rate-limit";
import { uid, } from "../../utils";
import { HttpStatus, } from "../http-utils";
import { createSessionAndCookie, } from "./session";
import { errorResponse, getClientIp, parseCredentials, rateLimitHtml, registerLimiter, } from "./shared";

/**
 * Enforce registration-open + rate-limit gates.
 * @param request
 * @param config
 * @param ip
 * @param t
 * @param limiter Optional per-call limiter override (tests); defaults to the
 *   module singleton.
 */
function checkRegisterGate(
  request: Request,
  config: Config,
  ip: string,
  t: TranslatorFn | undefined,
  limiter: RateLimiter = registerLimiter,
): Response | null {
  if (!config.auth.registrationOpen) {
    return errorResponse(request, HttpStatus.Forbidden, "auth.registrationClosed", t, "Registration is closed.",);
  }
  // BUG-429-responses-omit-retry-after-and-x-ratelimit-headers: emit headers.
  // BUG-register-rate-limiter-consumes-on-username-collision-retries: a
  // 409 on a duplicate username, a 422 on bad form data, or a 500 on
  // a transactional rollback must NOT cost the IP a budget slot — handleRegister
  // refunds the slot reserved below on every such skip path.
  const regLimit = limiter.peek(ip,);
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
 * @param limiter Optional per-call limiter override (tests); defaults to the
 *   module singleton.
 */
async function handleRegister(
  request: Request,
  database: Kysely<DB>,
  config: Config,
  t?: TranslatorFn,
  peerIp?: string | null,
  limiter: RateLimiter = registerLimiter,
): Promise<Response> {
  const ip = getClientIp(request, config, peerIp ?? null,);
  const gateError = checkRegisterGate(request, config, ip, t, limiter,);
  if (gateError) { return gateError; }
  // Reserve at the GATE, not after commit: a pure peek lets N concurrent
  // POSTs from one IP all pass an empty bucket and bounds nothing in flight
  // (BUG-register-peek-record-split-admits-unlimited-concurrent-regis).
  // Skip paths below refund the reservation.
  limiter.record(ip,);

  const formData = await parseCredentials(request,);
  if (!formData) {
    limiter.refund(ip,);
    return errorResponse(
      request,
      HttpStatus.BadRequest,
      "errors.badRequest",
      t,
      "Invalid request body",
    );
  }

  const username = formData.get("username",)?.trim();
  const password = formData.get("password",);
  if (!username || !password) {
    limiter.refund(ip,);
    return errorResponse(
      request,
      HttpStatus.UnprocessableEntity,
      "errors.missingField",
      t,
      "Username and password are required.",
    );
  }
  if (username.length < 3 || username.length > 32) {
    limiter.refund(ip,);
    return errorResponse(
      request,
      HttpStatus.UnprocessableEntity,
      "auth.usernameLength",
      t,
      "Username must be 3–32 characters.",
    );
  }
  if (password.length < 6) {
    limiter.refund(ip,);
    return errorResponse(
      request,
      HttpStatus.UnprocessableEntity,
      "auth.passwordLength",
      t,
      "Password must be at least 6 characters.",
    );
  }

  // Username uniqueness: the previous SELECT-then-INSERT left a race
  // window where two concurrent registrations of the same username both
  // passed the existence check, then the second hit the unique
  // constraint and bubbled an uncaught 500. The fix collapses the
  // check + insert into a single INSERT ... ON CONFLICT (username) DO
  // NOTHING via `insertUnique`; "skipped" is the authoritative answer
  // when a concurrent winner already claimed the username.
  //
  // All three writes (users, actors, actor_key when encryption is on)
  // run inside one transaction: a mid-flight throw rolls the users row
  // back, so a retry sees no committed username and re-inserts cleanly
  // (BUG-register-non-atomic-user-actor-key-insert).
  const userId = uid();
  const passwordHash = await Bun.password.hash(password,);
  const smk = isEncryptionEnabled() ? getSmk()! : null;

  let userResult: "inserted" | "skipped";
  try {
    userResult = await database.transaction().execute(async (trx,) => {
    const result = await insertUnique(
      trx,
      "users",
      {
        id: userId,
        username,
        display_name: username,
        password_hash: passwordHash,
        role: UserRole.User,
        status: UserStatus.Active,
        settings: "{}",
      },
      ["username",] as const,
    );
    if (result === "skipped") { return "skipped" as const; }

    await trx
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

    if (smk) {
      await ensureActorKey({ database: trx, actorId: userId, smk, },);
    }
    return "inserted" as const;
    },);
  } catch (error) {
    // Transactional rollback must not cost the IP a budget slot.
    limiter.refund(ip,);
    throw error;
  }

  if (userResult === "skipped") {
    limiter.refund(ip,);
    return errorResponse(request, HttpStatus.Conflict, "auth.usernameTaken", t, "Username already taken.",);
  }
  // Slot was reserved at the gate and the rows committed — keep it.
  return createSessionAndCookie(request, database, config, userId, UserRole.User, ip, t,);
}

export { handleRegister, };
