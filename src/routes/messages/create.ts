// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { ChatIdParams, ErrorResponse, MessageCreateBody, } from "../../validation/schemas";
import { requireUserId, } from "../http-utils";
import { createEntityConfirmRoutes, } from "./create-entity-confirm";
import { sendUserMessage, } from "./send-message";
import type { HandlerOpts, } from "./types";

/**
 * POST /chats/:id/messages — thin route over {@link sendUserMessage}.
 *
 * The handler body was extracted into `send-message.ts` (+ `send-intake.ts`
 * for the pre-insert gates) so the loop-lore-facade `chat.send` op shares the
 * same pipeline. Pure refactor: Elysia still validates `body`/`params`/
 * `response` here, and the pipeline behavior is byte-for-byte the old one.
 * @param opts
 * @param prefix
 */
export function createRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config, asyncStore, } = opts;

  return new Elysia({ name: "messages-create", },)
    .post(
      `${prefix}/chats/:id/messages`,
      async (ctx: any,) => {
        const actorId = requireUserId(ctx,);
        if (typeof actorId !== "string") { return actorId; }
        const { id: chatId, } = ctx.params as { id: string };
        const body = ctx.body as typeof MessageCreateBody.static;

        return sendUserMessage({
          database,
          config,
          asyncStore,
          userId: actorId,
          userRole: ctx.userRole as string | null,
          chatId,
          body,
          request: ctx.request as Request,
        },);
      },
      {
        params: ChatIdParams,
        body: MessageCreateBody,
        response: {
          201: t.Object({ id: t.String(), context: t.Any(), },),
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
          // Pending VN choice / question — a state conflict, not a permission one.
          409: ErrorResponse,
          503: ErrorResponse,
        },
      },
    )
    .use(createEntityConfirmRoutes(opts, prefix,),);
}
