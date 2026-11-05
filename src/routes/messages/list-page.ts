// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/routes/messages/list-page.ts — the GET /chats/:id/messages handler body
// as a callable service.
//
// Extracted verbatim from `read.ts` (pure refactor, no behavior change) so the
// HTTP route and the loop-lore-facade `chat.history` op share ONE pipeline:
// access check -> listMessages -> enrichment -> avatar resolution -> read-time
// translation negotiation -> jsonPaginated envelope.

import type { Kysely, } from "kysely";
import { attachMessageAvatars, } from "../../characters/services/wardrobe/message-avatar";
import { checkChatAccess, listMessages, } from "../../chat/service";
import type { Config, RegexTransform, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { getChildLogger, } from "../../logger";
import { detectLocale, } from "../../middleware/i18n";
import { notFound, } from "../../validation/middleware";
import { jsonPaginated, } from "../http-utils";
import { enrichMessageForList, } from "./helpers";
import { attachRequestedTranslations, } from "./list-translations";

/** Shape of the `GET /chats/:id/messages` query string (MessagesQuery). */
export interface MessageListQuery {
  page?: number;
  pageSize?: number;
  parentId?: string;
  translateLocale?: string;
}

/** Everything the list pipeline needs; identity arrives pre-extracted. */
export interface ListChatMessagesParams {
  database: Kysely<DB>;
  config: Config;
  userId: string | null;
  userRole: string | null;
  chatId: string;
  query: MessageListQuery;
  request: Request;
  /** Optional i18n translator; absent falls back to the plain-English message. */
  translator?: ((key: string,) => string) | undefined;
  /** Precomputed regex transforms (shared per-route array — see read.ts). */
  regexTransforms: ReadonlyArray<RegexTransform>;
}

/**
 * List one page of a chat's messages, enriched for rendering.
 *
 * Guest-open read: public chats admit the synthetic guest tier (the access
 * check's public branch decides). A wardrobe/translation failure never costs
 * the reader their message page — the per-concern boundaries below hold that
 * line (TASK-chat-avatar-resolver-outfit-aware, FEAT-language-selection-three-level).
 * @param params - database/config handle, identity, chat id, query, request
 * @returns the jsonPaginated envelope Response the route returns verbatim
 */
export async function listChatMessagesPage(
  params: ListChatMessagesParams,
): Promise<Response> {
  const { database, userId, userRole, chatId, query, request, translator, regexTransforms, } = params;

  const access = await checkChatAccess(database, chatId, userId, userRole,);
  if (!access.ok) {
    return notFound(translator?.("messages.chatNotFound",) ?? "Chat not found",);
  }

  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;

  const { data: messages, total, } = await listMessages(database, {
    chatId,
    page,
    pageSize,
    parentId: query.parentId,
  },);

  const enrichResults = await Promise.allSettled(
    messages.map((m,) => enrichMessageForList(database, m as never, regexTransforms,)),
  );

  const enriched: Record<string, unknown>[] = [];
  for (const r of enrichResults) {
    if (r.status === "fulfilled") { enriched.push(r.value,); }
  }

  // TASK-chat-avatar-resolver-outfit-aware: resolve each message's avatar
  // server-side through the single wardrobe ladder owner, so the header
  // outfit switcher reaches the render path. A row whose actor resolves
  // no outfit keeps its field absent and renders exactly as before.
  // Belt-and-braces: the resolver already swallows per-row failures, but
  // the endpoint contract is that a wardrobe problem must never cost the
  // reader their message page, so the boundary holds the line too.
  try {
    await attachMessageAvatars({ database, chatId, messages: enriched, },);
  } catch (error) {
    getChildLogger("routes.messages.read",)?.error(
      "Failed to attach message avatars",
      error instanceof Error ? error : undefined,
      { chatId, },
    );
  }

  // Read-time translation negotiation (FEAT-language-selection-three-level):
  // opt-in `?translateLocale=<locale|auto>` attaches the matching
  // message_translations row per message (ONE inArray select). Default
  // payloads (no param) are unchanged, and a negotiation failure never
  // costs the reader their message page.
  await attachRequestedTranslations(database, enriched, {
    chatId,
    userId: userId ?? "",
    uiLocale: detectLocale(request,),
    requestedLocale: query.translateLocale,
  },);

  return jsonPaginated({ data: enriched, total, page, pageSize, },);
}
