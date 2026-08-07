import type { Kysely, } from "kysely";
import { signJwt, } from "../../auth/jwt";
import type { Config, } from "../../config/schema";
import { ensureActorKey, getSmk, isEncryptionEnabled, } from "../../crypto";
import { UserRole, UserStatus, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { TranslatorFn, } from "../../i18n/types";
import { getOrCreateSoloUserForAuth, } from "../../middleware/auth";
import { uid, } from "../../utils";
import { HttpStatus, jsonError, } from "../http-utils";
import { errorHtml, getClientIp, loginLimiter, setTokenCookie, } from "./shared";

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

export { handleDemoLogin, handleLogin, };
