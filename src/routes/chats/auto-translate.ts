// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { normalizeTargetLang, setChatTargetLang, } from "../../chat/auto-translate";
import { checkChatSettingsAccess, } from "../../chat/service";
import {
  readChatContentLanguage,
  setChatContentLanguage,
} from "../../chat/translation-target";
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
 *
 * DEPRECATED (FEAT-language-selection-three-level): kept as a back-compat
 * alias that writes the unified `gm_config.contentLanguage` key (and clears
 * the legacy `story_state.autoTranslateLang` fallback). New writers should
 * use the chat content-language control / gm-config PATCH flow.
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { chats: { ":id": { "auto-translate": { ...; }; }; }; }; } & { ...; }, { ...; }, { ...; }>}
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

          // DEPRECATED alias (FEAT-language-selection-three-level): writes the
          // unified `gm_config.contentLanguage` key and clears the legacy
          // `story_state.autoTranslateLang` so the read-through fallback never
          // disagrees with the written value. Removed once the chat-settings
          // control is the only writer.
          const gmRow = await database
            .selectFrom("chats",)
            .select("gm_config",)
            .where("id", "=", id,)
            .executeTakeFirst();

          const nextGm = setChatContentLanguage(gmRow?.gm_config, body.targetLang ?? null,);
          const nextStory = setChatTargetLang(row.story_state, null,);
          await database
            .updateTable("chats",)
            .set({ gm_config: nextGm, story_state: nextStory, },)
            .where("id", "=", id,)
            .execute();

          return jsonResponse({ data: { targetLang: readChatContentLanguage(nextGm, nextStory,), }, },);
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

        // DEPRECATED alias: clears both the unified `gm_config.contentLanguage`
        // key and the legacy `story_state.autoTranslateLang` fallback.
        const gmRow = await database
          .selectFrom("chats",)
          .select("gm_config",)
          .where("id", "=", id,)
          .executeTakeFirst();

        const nextGm = setChatContentLanguage(gmRow?.gm_config, null,);
        const nextStory = setChatTargetLang(row.story_state, null,);
        await database
          .updateTable("chats",)
          .set({ gm_config: nextGm, story_state: nextStory, },)
          .where("id", "=", id,)
          .execute();

        return jsonResponse({ data: { targetLang: readChatContentLanguage(nextGm, nextStory,), }, },);
      }, { params: ChatIdParams, },)
  );
}
