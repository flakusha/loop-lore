// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Party split / reunion routes (C7 Phase 3).
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { reuniteChats, splitParty, } from "../../chat/service";
import type { DB, } from "../../db/schema";
import {
  HttpStatus,
  jsonCreated,
  jsonError,
  jsonResponse,
  requireUserId,
} from "../http-utils";
import type { HandlerOpts, } from "./types";

const ChatIdParams = {
  params: t.Object({ id: t.String(), },),
} as const;

const splitBody = t.Object({
  branches: t.Array(
    t.Object({
      name: t.Optional(t.String(),),
      locationId: t.String(),
      actorIds: t.Array(t.String(),),
    },),
  ),
},);

const reuniteBody = t.Object({
  secondaryChatId: t.String(),
},);

/**
 * @param opts
 * @param prefix
 */
export function partySplitRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chats-party-split", },)
      .post(
        `${prefix}/chats/:id/split`,
        handleSplit(database,),
        { params: ChatIdParams.params, body: splitBody, },
      )
      .post(
        `${prefix}/chats/:id/reunite`,
        handleReunite(database,),
        { params: ChatIdParams.params, body: reuniteBody, },
      )
  );
}

/**
 * @param database
 */
function handleSplit(database: Kysely<DB>,) {
  return async (ctx: any,) => {
    const userId = requireUserId(ctx,);
    if (typeof userId !== "string") { return userId; }

    const { id: chatId, } = ctx.params;
    const body = ctx.body as (typeof splitBody)["static"];

    // Ownership is derived from the session user, NOT a client-supplied
    // actorId — the latter would let a non-owner spoof the chat owner and
    // bypass the `created_by` guard in `splitParty` (trust-boundary IDOR).
    const result = await splitParty(database, { chatId, actorId: userId, branches: body.branches, },);

    if ("code" in result) {
      const status = result.code === "not_found"
        ? HttpStatus.NotFound
        : (result.code === "forbidden"
          ? HttpStatus.Forbidden
          : HttpStatus.BadRequest);
      return jsonError(result.message, status, result.code as never,);
    }

    return jsonCreated({ data: result, },);
  };
}

/**
 * @param database
 */
function handleReunite(database: Kysely<DB>,) {
  return async (ctx: any,) => {
    const userId = requireUserId(ctx,);
    if (typeof userId !== "string") { return userId; }

    const { id: primaryChatId, } = ctx.params;
    const body = ctx.body as (typeof reuniteBody)["static"];

    // Ownership is derived from the session user, NOT a client-supplied
    // actorId — the latter would let a non-owner spoof the primary/secondary
    // chat owner and bypass the `created_by` guard in `reuniteChats`.
    const result = await reuniteChats(database, {
      primaryChatId,
      secondaryChatId: body.secondaryChatId,
      actorId: userId,
    },);

    if ("code" in result) {
      const status = result.code === "not_found"
        ? HttpStatus.NotFound
        : (result.code === "forbidden"
          ? HttpStatus.Forbidden
          : HttpStatus.BadRequest);
      return jsonError(result.message, status, result.code as never,);
    }

    return jsonResponse({ data: result, },);
  };
}
