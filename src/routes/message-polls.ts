// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Message poll routes (TASK-message-polls-votes).
 *
 * POST   /api/messages/:id/poll        — create the message's poll
 * GET    /api/messages/:id/poll        — read one poll + tallies
 * POST   /api/messages/:id/poll/vote   — cast/replace a vote
 * POST   /api/messages/:id/poll/close  — close (creator/owner/admin)
 * GET    /api/chats/:id/polls          — all polls in a chat (viewer-scoped)
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import {
  closePoll,
  createPoll,
  getMessagePoll,
  listChatPolls,
  votePoll,
} from "../chat/service";
import type { DB, } from "../db/schema";
import { ErrorResponse, } from "../validation/schemas";
import { extractAuth, jsonResponse, requireUserId, } from "./http-utils";
import { serviceErrorToResponse, } from "./messages/helpers";

interface HandlerOpts {
  database: Kysely<DB>;
}

const tMessageIdParams = t.Object({ id: t.String(), },);
const tChatIdParams = t.Object({ id: t.String(), },);
const tCreateBody = t.Object({
  question: t.String({ maxLength: 500, },),
  options: t.Array(t.String({ maxLength: 200, },), { minItems: 2, maxItems: 10, },),
  multi: t.Boolean(),
  closesAt: t.Optional(t.Nullable(t.String(),),),
},);

const tVoteBody = t.Object({ optionIdx: t.Integer({ minimum: 0, },), },);

/**
 * @param opts
 * @param prefix
 */
export function messagePollRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "message-polls", },)
    .post(
      `${prefix}/messages/:id/poll`,
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { userRole, } = extractAuth(ctx,);
        const body = ctx.body;
        const result = await createPoll({
          database,
          messageId: ctx.params.id,
          userId,
          userRole,
          question: body.question,
          options: body.options,
          multi: body.multi,
          closesAt: body.closesAt ?? null,
        },);

        if (!result.ok) { return serviceErrorToResponse(result.error,); }
        return jsonResponse(result.poll,);
      },
      {
        params: tMessageIdParams,
        body: tCreateBody,
        response: { 200: t.Any(), 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, 409: ErrorResponse, },
        detail: {
          summary: "Create the poll attached to a message",
          description: "One poll per message; the creator must have chat access.",
          tags: ["Messages", "Polls",],
        },
      },
    )
    .get(
      `${prefix}/messages/:id/poll`,
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { userRole, } = extractAuth(ctx,);
        const result = await getMessagePoll({
          database,
          messageId: ctx.params.id,
          userId,
          userRole,
        },);

        if (!result.ok) { return serviceErrorToResponse(result.error,); }
        return jsonResponse(result.poll,);
      },
      {
        params: tMessageIdParams,
        response: { 200: t.Any(), 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Read a message poll",
          description: "Returns the poll with per-option tallies and the viewer's votes.",
          tags: ["Messages", "Polls",],
        },
      },
    )
    .get(
      `${prefix}/chats/:id/polls`,
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { userRole, } = extractAuth(ctx,);
        const result = await listChatPolls({
          database,
          chatId: ctx.params.id,
          userId,
          userRole,
        },);

        if (!result.ok) { return serviceErrorToResponse(result.error,); }
        return jsonResponse(result.polls,);
      },
      {
        params: tChatIdParams,
        response: { 200: t.Any(), 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "List all polls in a chat",
          description: "Returns polls with per-option tallies and the viewer's votes.",
          tags: ["Messages", "Polls",],
        },
      },
    )
    .post(
      `${prefix}/messages/:id/poll/vote`,
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { userRole, } = extractAuth(ctx,);
        const result = await votePoll({
          database,
          messageId: ctx.params.id,
          userId,
          userRole,
          optionIdx: ctx.body.optionIdx,
        },);

        if (!result.ok) { return serviceErrorToResponse(result.error,); }
        return jsonResponse(result.poll,);
      },
      {
        params: tMessageIdParams,
        body: tVoteBody,
        response: { 200: t.Any(), 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, 409: ErrorResponse, },
        detail: {
          summary: "Vote on a message poll",
          description:
            "Single-choice polls replace the voter's option; multi-choice polls add a distinct option. Closed polls return 409.",
          tags: ["Messages", "Polls",],
        },
      },
    )
    .post(
      `${prefix}/messages/:id/poll/close`,
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { userRole, } = extractAuth(ctx,);
        const result = await closePoll({
          database,
          messageId: ctx.params.id,
          userId,
          userRole,
        },);

        if (!result.ok) { return serviceErrorToResponse(result.error,); }
        return jsonResponse(result.poll,);
      },
      {
        params: tMessageIdParams,
        response: { 200: t.Any(), 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Close a message poll",
          description: "Only the poll creator, chat owner, or admin can close. Idempotent.",
          tags: ["Messages", "Polls",],
        },
      },
    );
}
