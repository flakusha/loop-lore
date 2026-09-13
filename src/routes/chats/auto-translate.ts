// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { normalizeTargetLang, resolveTargetLang, setChatTargetLang, } from "../../chat/auto-translate";
import { checkChatSettingsAccess, } from "../../chat/service";
import { ChatAutoTranslateBody, ChatIdParams, } from "../../validation/schemas";
import {
  badRequestResponse,
  forbiddenResponse as forbidden,
  jsonResponse,
  notFoundResponse as notFound,
  requireUserId,
} from "../http-utils";
import type { HandlerOpts, } from "./types";

/**
 * Per-chat auto-translation target (`epic-output-control-transforms`).
 * @param opts
 * @param prefix
 */
export function autoTranslateRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chats-auto-translate", },)
      .patch(
        `${prefix}/chats/:id/auto-translate`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as typeof ChatAutoTranslateBody.static;

          const access = await checkChatSettingsAccess(database, id, userId, userRole,);
          if (!access.ok) {
            if (access.error.code === "not_found") { return notFound(); }
            return forbidden();
          }

          const row = await database
            .selectFrom("chats",)
            .select("story_state",)
            .where("id", "=", id,)
            .executeTakeFirst();
          if (!row) { return notFound(); }

          // Explicit codes only: unknown codes are a 400, not a silent clear.
          if (body.targetLang !== undefined && normalizeTargetLang(body.targetLang,) === null) {
            return badRequestResponse(`Unknown target language: "${body.targetLang}".`,);
          }

          const next = setChatTargetLang(row.story_state, body.targetLang ?? null,);
          await database
            .updateTable("chats",)
            .set({ story_state: next, },)
            .where("id", "=", id,)
            .execute();
          return jsonResponse({ data: { targetLang: resolveTargetLang(next,), }, },);
        },
        { body: ChatAutoTranslateBody, params: ChatIdParams, },
      )
      .delete(`${prefix}/chats/:id/auto-translate`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const userRole = ctx.userRole as string | null;
        const id = (ctx.params as { id: string }).id;

        const access = await checkChatSettingsAccess(database, id, userId, userRole,);
        if (!access.ok) {
          if (access.error.code === "not_found") { return notFound(); }
          return forbidden();
        }

        const row = await database
          .selectFrom("chats",)
          .select("story_state",)
          .where("id", "=", id,)
          .executeTakeFirst();
        if (!row) { return notFound(); }

        const next = setChatTargetLang(row.story_state, null,);
        await database
          .updateTable("chats",)
          .set({ story_state: next, },)
          .where("id", "=", id,)
          .execute();
        return jsonResponse({ data: { targetLang: resolveTargetLang(next,), }, },);
      }, { params: ChatIdParams, },)
  );
}
