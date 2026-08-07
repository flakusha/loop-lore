import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { notFound, unauthorized, } from "../../validation/middleware";
import { HttpStatus, jsonResponse, } from "../http-utils";
import {
  COOKIE_PATH,
  extractSessionIdFromJwt,
  extractUserIdFromJwt,
  getTokenFromCookie,
  TOKEN_COOKIE,
} from "./shared";

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

export { handleLogout, handleMe, };
