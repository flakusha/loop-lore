// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { checkChatSettingsAccess, updateGmGuidance, } from "../../chat/service";
import { ChatIdParams, GmGuidanceUpdateBody, } from "../../validation/schemas";
import {
  forbiddenResponse as forbidden,
  jsonResponse,
  notFoundResponse as notFound,
  requireUserId,
} from "../http-utils";
import type { HandlerOpts, } from "./types";

/**
 * GM-guidance routes — runtime human-GM narrative steering.
 *
 * `PUT /api/v1/chats/:id/gm-guidance` patches `gm_config.storyMode` /
 * `gm_config.gmGuidance` WITHOUT the online key-mechanic immutability guard, so
 * a Game Master can steer an in-progress story.
 * @param opts
 * @param prefix
 */
export function gmGuidanceRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "chats-gm-guidance", },)
    .put(
      `${prefix}/chats/:id/gm-guidance`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const userRole = ctx.userRole as string | null;
        const id = (ctx.params as { id: string }).id;
        const body = ctx.body as typeof GmGuidanceUpdateBody.static;

        const access = await checkChatSettingsAccess(database, id, userId, userRole,);
        if (!access.ok) { return forbidden(); }

        const result = await updateGmGuidance(database, id, {
          storyMode: body.storyMode,
          gmGuidance: body.gmGuidance,
        },);
        if ("code" in result) {
          return notFound(result.message,);
        }
        return jsonResponse({ ok: true, },);
      },
      { body: GmGuidanceUpdateBody, params: ChatIdParams, },
    );
}
