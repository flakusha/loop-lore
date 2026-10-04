// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Guard + response helpers for the scheduled-message routes
 * (TASK-scheduled-messages-reminders). Split from the route barrel so the
 * handler bodies stay focused on the service call.
 *
 * Every chat-scoped endpoint runs `checkChatAccess` and answers 404 on
 * denial — the codebase convention that hides chat existence rather than
 * 403-ing it (same shape as `routes/chat-pins.ts`).
 */
import type { Context, } from "elysia";
import type { Kysely, } from "kysely";
import { checkChatAccess, type ServiceError, } from "../../chat/service";
import type { DB, } from "../../db/schema";
import { notFound, } from "../../validation/middleware";
import type { HttpStatusCode, } from "../http-utils";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";

/** Auth fields the global derive populates; tests inject the same shape. */
interface AuthContext {
  userId: string | null;
  userRole: string | null;
}
type Ctx = Context & AuthContext;

/** The resolved caller handed to a handler by `withChat` / `requireUser`. */
export interface Caller {
  userId: string;
}

/**
 * Service-error mapping for these routes. A `forbidden` (someone else's
 * parked row) answers 404, not 403 — same chat-hiding convention
 * `checkChatAccess` uses, so a stranger cannot probe for row existence.
 * @param error
 * @returns {Response}
 */
export function scheduledError(error: ServiceError,): Response {
  if (error.code === "bad_request") {
    return jsonError({ message: error.message, status: HttpStatus.BadRequest, },);
  }

  return notFound(error.message,);
}

/**
 * Resolve the caller for a user-scoped endpoint. Returns the userId, or the
 * 401 response to return verbatim.
 * @param ctx
 * @returns {Caller | Response}
 */
export function requireUser(ctx: unknown,): Caller | Response {
  const userId = requireUserId(ctx as Ctx,);
  if (typeof userId !== "string") { return userId; }
  return { userId, };
}

/**
 * Resolve the caller and assert chat access in one step. Returns the caller
 * on success, or the 401/404 response to return verbatim.
 * @param database
 * @param ctx
 * @param chatId
 * @returns {Promise<Caller | Response>}
 */
export async function requireChatAccess(
  database: Kysely<DB>,
  ctx: unknown,
  chatId: string,
): Promise<Caller | Response> {
  const auth = requireUser(ctx,);
  if (auth instanceof Response) { return auth; }
  const access = await checkChatAccess(database, chatId, auth.userId, (ctx as Ctx).userRole,);
  if (!access.ok) { return notFound("Chat not found",); }
  return auth;
}

/**
 * Wrap a chat-scoped handler so the access prelude runs once. The inner
 * handler receives the already-authorized caller; returning a `Response`
 * short-circuits before it is reached.
 * @param database
 * @param handler
 * @returns {Function}
 */
export function withChat(
  database: Kysely<DB>,
  handler: (ctx: unknown, chatId: string, caller: Caller,) => Promise<Response>,
) {
  return async (ctx: unknown,): Promise<Response> => {
    const params = (ctx as { params: { id: string } }).params;
    const access = await requireChatAccess(database, ctx, params.id,);
    if (access instanceof Response) { return access; }
    return handler(ctx, params.id, access,);
  };
}

/**
 * Tail shared by every service call here: map a service error to its HTTP
 * response, otherwise answer 200 with the payload.
 * @param result
 * @param status
 * @returns {Response}
 */
export function respond(result: { ok: true } | ServiceError, status?: HttpStatusCode,): Response {
  if (!("ok" in result)) { return scheduledError(result,); }
  return jsonResponse(result, status,);
}
