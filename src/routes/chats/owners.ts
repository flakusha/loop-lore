// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import {
  addChatOwner,
  checkChatAccess,
  listEffectiveOwnerUserIds,
  removeChatOwner,
} from "../../chat/service";
import type { ChatOwnersOpOutcome, } from "../../chat/service";
import {
  ChatIdParams,
  ChatOwnerAddBody,
  ChatOwnerParams,
  ChatOwnerRemoveQuery,
} from "../../validation/schemas";
import {
  badRequestResponse,
  forbiddenResponse,
  jsonError,
  jsonResponse,
  notFoundResponse,
  requireUserId,
} from "../http-utils";
import type { HandlerOpts, } from "./types";

/** Failed half of the owners-set outcome envelope (service error channel). */
type OwnersFailure = Extract<ChatOwnersOpOutcome, { ok: false }>;

/**
 * Map a service error channel to an HTTP response, mirroring the
 * transfer-ownership route's mapping (not_found 404 / forbidden 403 /
 * bad_request 400 / unknown 500).
 * @param outcome
 */
function ownersErrorResponse(outcome: OwnersFailure,) {
  switch (outcome.error.code) {
    case "not_found":
      return notFoundResponse(outcome.error.message,);
    case "forbidden":
      return forbiddenResponse(outcome.error.message,);
    case "bad_request":
      return badRequestResponse(outcome.error.message,);
    default:
      return jsonError({ message: "Unknown error", status: 500, },);
  }
}

/**
 * GET /api/chats/:id/owners — the chat's owner user ids (sorted).
 * POST /api/chats/:id/owners — grant co-ownership (body: actorId, reason?).
 * DELETE /api/chats/:id/owners/:userId — remove an owner (query: reason?);
 *   targeting your own user id resigns. Authority lives in the service.
 *
 * Errors: 404 chat/actor not found; 403 requester is not an owner/admin;
 *   400 duplicate owner / cap reached / last-owner guard / concurrent change.
 * @param opts
 * @param prefix
 * @returns {Elysia}
 */
export function chatOwnerRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chats-owners", },)
      .get(
        `${prefix}/chats/:id/owners`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const chatId = (ctx.params as { id: string }).id;

          const access = await checkChatAccess(database, chatId, userId, userRole,);
          if (!access.ok) {
            return notFoundResponse("Chat not found",);
          }

          const owners = await listEffectiveOwnerUserIds(database, chatId,);
          return jsonResponse({ chatId, owners, },);
        },
        { params: ChatIdParams, },
      )
      .post(
        `${prefix}/chats/:id/owners`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = (ctx.userRole as string | null) ?? null;

          const chatId = (ctx.params as { id: string }).id;
          const body = ctx.body as { actorId?: string; reason?: string };

          // Belt-and-braces: the schema below rejects a missing/invalid
          // `actorId` with 422 before this handler runs (runtime check
          // covers malformed bodies, mirroring the transfer route).
          if (!body?.actorId || typeof body.actorId !== "string") {
            return badRequestResponse("actorId required",);
          }

          const outcome = await addChatOwner(database, {
            chatId,
            requesterId: userId,
            requesterRole: userRole,
            actorId: body.actorId,
            reason: body.reason,
          },);

          if (!outcome.ok) {
            return ownersErrorResponse(outcome,);
          }

          return jsonResponse({
            ok: true,
            chatId,
            userId: outcome.result.userId,
            autoInvited: outcome.result.autoInvited ?? false,
            owners: outcome.result.owners,
          },);
        },
        { params: ChatIdParams, body: ChatOwnerAddBody, },
      )
      .delete(
        `${prefix}/chats/:id/owners/:userId`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = (ctx.userRole as string | null) ?? null;

          const { id: chatId, userId: targetUserId, } = ctx.params as { id: string; userId: string };

          const query = ctx.query as { reason?: string };

          const outcome = await removeChatOwner(database, {
            chatId,
            requesterId: userId,
            requesterRole: userRole,
            userId: targetUserId,
            reason: query?.reason,
          },);

          if (!outcome.ok) {
            return ownersErrorResponse(outcome,);
          }

          return jsonResponse({
            ok: true,
            chatId,
            userId: outcome.result.userId,
            owners: outcome.result.owners,
          },);
        },
        { params: ChatOwnerParams, query: ChatOwnerRemoveQuery, },
      )
  );
}
