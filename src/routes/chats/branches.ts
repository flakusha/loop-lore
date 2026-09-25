// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat branching routes (FEAT-045).
 *
 *   POST   /chats/:chatId/fork             → create branch at message
 *   PATCH  /chats/:chatId/active-branch    → switch active branch
 *   GET    /chats/:chatId/branches         → list branches with metadata
 *
 * Ownership is derived from the session user (via `requireUserId`), never
 * from the body — a non-participant cannot spoof an actorId to pass the
 * service-layer `checkChatAccess` guard.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import {
  forkBranch,
  listBranches,
  switchActiveBranch,
} from "../../chat/service/branches";
import type { DB, } from "../../db/schema";
import {
  HttpStatus,
  jsonCreated,
  jsonError,
  jsonResponse,
  requireUserId,
} from "../http-utils";
import type { HandlerOpts, } from "./types";

const ChatIdParams = { params: t.Object({ id: t.String(), },), } as const;

const forkBody = t.Object({
  messageId: t.String(),
  name: t.Optional(t.String(),),
},);

const switchBody = t.Object({ branchId: t.String(), },);

/** Map service errors to HTTP status. */
function statusFor(code: string,): (typeof HttpStatus)[keyof typeof HttpStatus] {
  if (code === "not_found") { return HttpStatus.NotFound; }
  if (code === "forbidden") { return HttpStatus.Forbidden; }
  return HttpStatus.BadRequest;
}

/**
 * @param opts
 * @param prefix
 */
export function chatBranchRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  return new Elysia({ name: "chats-branches", },)
    .post(`${prefix}/chats/:id/fork`, handleFork(database,), { params: ChatIdParams.params, body: forkBody, },)
    .patch(
      `${prefix}/chats/:id/active-branch`,
      handleSwitch(database,),
      { params: ChatIdParams.params, body: switchBody, },
    )
    .get(`${prefix}/chats/:id/branches`, handleList(database,), { params: ChatIdParams.params, },);
}

/** POST /chats/:id/fork */
function handleFork(database: Kysely<DB>,) {
  return async (ctx: any,) => {
    const userId = requireUserId(ctx,);
    if (typeof userId !== "string") { return userId; }
    const { id: chatId, } = ctx.params as { id: string };
    const body = ctx.body as { messageId: string; name?: string };

    const result = await forkBranch(database, {
      chatId,
      messageId: body.messageId,
      actorId: userId,
      name: body.name,
    },);
    if ("code" in result) {
      return jsonError(result.message, statusFor(result.code,), result.code as never,);
    }
    return jsonCreated({ data: result, },);
  };
}

/** PATCH /chats/:id/active-branch */
function handleSwitch(database: Kysely<DB>,) {
  return async (ctx: any,) => {
    const userId = requireUserId(ctx,);
    if (typeof userId !== "string") { return userId; }
    const { id: chatId, } = ctx.params as { id: string };
    const body = ctx.body as { branchId: string };

    const result = await switchActiveBranch(database, {
      chatId,
      branchId: body.branchId,
      actorId: userId,
    },);
    if ("code" in result) {
      return jsonError(result.message, statusFor(result.code,), result.code as never,);
    }
    return jsonResponse({ data: result, },);
  };
}

/** GET /chats/:id/branches */
function handleList(database: Kysely<DB>,) {
  return async (ctx: any,) => {
    const userId = requireUserId(ctx,);
    if (typeof userId !== "string") { return userId; }
    const { id: chatId, } = ctx.params as { id: string };

    const result = await listBranches(database, chatId, userId,);
    if ("code" in result) {
      return jsonError(result.message, statusFor(result.code,), result.code as never,);
    }
    return jsonResponse({ data: result, },);
  };
}
