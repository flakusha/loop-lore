// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Entity-suggestion read endpoint.
 *
 * GET /api/chats/:id/entity-suggestions — advisory scan of recent narration
 * for in-story entity introductions. Stateless: detection runs on read, so
 * there is no persisted suggestion state and no story-blocking behavior.
 */

import { Elysia, t, } from "elysia";
import { collectEntitySuggestions, } from "../../assistant/entity-spec/suggestions";
import { checkChatAccess, } from "../../chat/service";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonResponse, requireUserId, } from "../http-utils";
import { serviceErrorToResponse, } from "../messages/helpers";
import type { HandlerOpts, } from "./types";

/** Recent messages scanned per read. */
const SCAN_WINDOW = 30;

/**
 * @param opts
 * @param prefix
 */
export function entitySuggestionRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "chats-entity-suggestions", },).get(
    `${prefix}/chats/:id/entity-suggestions`,
    async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const { id: chatId, } = ctx.params;

      const access = await checkChatAccess(database, chatId, userId, null,);
      if (!access.ok) { return serviceErrorToResponse(access.error,); }

      const recent = await database
        .selectFrom("messages",)
        .where("chat_id", "=", chatId,)
        .where("visibility", "=", "visible",)
        .orderBy("created_at", "desc",)
        .limit(SCAN_WINDOW,)
        .select(["role", "content",],)
        .execute();

      return jsonResponse({ items: collectEntitySuggestions(recent,), },);
    },
    {
      response: {
        200: t.Object({
          items: t.Array(t.Object({
            kind: t.String(),
            name: t.String(),
            seed: t.String(),
          },),),
        },),
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
    },
  );
}
