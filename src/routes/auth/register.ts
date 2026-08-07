import type { Kysely, } from "kysely";
import { signJwt, } from "../../auth/jwt";
import type { Config, } from "../../config/schema";
import { ensureActorKey, getSmk, isEncryptionEnabled, } from "../../crypto";
import { UserRole, UserStatus, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { TranslatorFn, } from "../../i18n/types";
import { uid, } from "../../utils";
import { HttpStatus, jsonError, } from "../http-utils";
import { errorHtml, getClientIp, registerLimiter, setTokenCookie, } from "./shared";

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
      format_version: 0,
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

export { handleRegister, };
