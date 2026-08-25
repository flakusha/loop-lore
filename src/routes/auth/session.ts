// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { notFound, unauthorized, } from "../../validation/middleware";
import { HttpStatus, jsonResponse, } from "../http-utils";
import {
  COOKIE_PATH,
  TOKEN_COOKIE,
} from "./shared";

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

export { handleLogout, handleMe, };
