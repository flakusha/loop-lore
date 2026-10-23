// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-chat classifier tag subset routes.
 *
 * GET  /api/chats/:id/classifier-tags — the curated vocabulary plus this
 *   chat's active subset.
 * PUT  /api/chats/:id/classifier-tags — replace the active subset; entries
 *   outside the current vocabulary are rejected with 400.
 *
 * Authority is the chat-settings gate (`checkChatSettingsAccess`): admin /
 * creator / role_in_chat=owner / GM pass; plain members do not. The subset
 * persists in system_config under `classifier_tags_active:<chatId>`.
 */
import { Elysia, } from "elysia";
import {
  filterActiveSubset,
  readActiveTags,
  readTagVocabulary,
  writeActiveTags,
} from "../../aux-pipeline/class-tag-vocab";
import { checkChatSettingsAccess, } from "../../chat/service";
import { ChatIdParams, ClassifierTagsUpdateBody, } from "../../validation/schemas";
import {
  badRequestResponse,
  forbiddenResponse,
  jsonResponse,
  requireUserId,
  unauthorizedResponse,
} from "../http-utils";
import type { HandlerOpts, } from "./types";

/**
 * @param opts - Shared route options.
 * @param prefix - Mount prefix; defaults to `/api` so the route is
 *   `/api/chats/:id/classifier-tags` — matching the v1 chats subplugin shape.
 * @returns Elysia plugin with the classifier-tag subset endpoints.
 */
export function classifierTagRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "chats-classifier-tags", },)
    .get(
      `${prefix}/chats/:id/classifier-tags`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const userRole = ctx.userRole as string | null;
        const chatId = (ctx.params as { id: string }).id;

        const access = await checkChatSettingsAccess(database, chatId, userId, userRole,);
        if (!access.ok) {
          return userRole ? forbiddenResponse(access.error.message,) : unauthorizedResponse();
        }

        const vocabulary = await readTagVocabulary(database,);
        const active = await readActiveTags(database, chatId,);

        return jsonResponse({ vocabulary, active, },);
      },
      { params: ChatIdParams, },
    )
    .put(
      `${prefix}/chats/:id/classifier-tags`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const userRole = ctx.userRole as string | null;
        const chatId = (ctx.params as { id: string }).id;
        const { tags, } = ctx.body as typeof ClassifierTagsUpdateBody.static;

        const access = await checkChatSettingsAccess(database, chatId, userId, userRole,);
        if (!access.ok) {
          return userRole ? forbiddenResponse(access.error.message,) : unauthorizedResponse();
        }

        const vocabulary = await readTagVocabulary(database,);
        // Vocabulary membership is enforced server-side: the picker UI is a
        // convenience, this check is the contract.
        const rejected = tags.filter((tag,) => !vocabulary.includes(tag,));
        if (rejected.length > 0) {
          return badRequestResponse(`tags outside the vocabulary: ${rejected.join(", ",)}`,);
        }

        const active = filterActiveSubset(tags, vocabulary,);
        await writeActiveTags(database, chatId, active,);
        return jsonResponse({ ok: true, active, },);
      },
      { body: ClassifierTagsUpdateBody, params: ChatIdParams, },
    );
}
