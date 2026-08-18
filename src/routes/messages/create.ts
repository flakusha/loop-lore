// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { getConfigValue, } from "../../admin/config";
import { computeContextStats, } from "../../chat";
import { ProactiveMessagingService, } from "../../chat/proactive";
import { checkChatAccess, updateMessageVisibility, } from "../../chat/service";
import {
  MessageContentFormat,
  MessageContentType,
  MessageRole,
  MessageStatus,
} from "../../db/enums";
import type { ContentEncoding, } from "../../db/enums";
import { parseInitiativeFlag, } from "../../group-chat/mention-parser";
import { getLogger, } from "../../logger";
import { NsfwModerationService, } from "../../nsfw/moderation-service";
import { containsProfanity, filter as filterProfanity, } from "../../profanity/service";
import { uid, } from "../../utils";
import { ChatIdParams, ErrorResponse, MessageCreateBody, } from "../../validation/schemas";
import { jsonCreated, requireUserId, } from "../http-utils";
import { dispatchCommand, } from "./command";
import { createEntityConfirmRoutes, } from "./create-entity-confirm";
import { handleSceneTransitions, } from "./handle-scene-transitions";
import { serviceErrorToResponse, } from "./helpers";
import { attachMessageAttachments, persistInitiative, persistMentions, prepareContentStorage, } from "./post";
import { maybeAutoReply, } from "./reply";
import { autoRenameChat, } from "./transitions";
import type { HandlerOpts, } from "./types";

export function createRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config, } = opts;

  return new Elysia({ name: "messages-create", },)
    .post(
      `${prefix}/chats/:id/messages`,
      async (ctx: any,) => {
        const actorId = requireUserId(ctx,);
        if (typeof actorId !== "string") { return actorId; }
        const { id: chatId, } = ctx.params as { id: string };
        const body = ctx.body as typeof MessageCreateBody.static;

        const filteredContent = filterProfanity(body.content,);
        const hasProfanity = containsProfanity(body.content,);

        // ── NSFW content check on user message ─────────────────────
        // Lightweight flag/warn — does not suppress the message, just logs
        // when user-submitted content exceeds their max rating.
        await flagNsfwUserMessage(database, actorId, chatId, body.content,);

        const { isInitiative, cleanMessage, } = parseInitiativeFlag(filteredContent,);
        const effectiveContent = isInitiative ? cleanMessage : filteredContent;

        const access = await checkChatAccess(database, chatId, actorId, ctx.userRole as string | null,);
        if (!access.ok) { return serviceErrorToResponse(access.error,); }

        // ── Proactive-messaging backoff reset ────────────────────────
        // When the user responds, reset the anti-spam backoff for every
        // character with proactive messaging enabled in this chat.
        const proactive = new ProactiveMessagingService(database,);
        const proactiveConfigs = await proactive.getChatConfigs(chatId,);
        for (const pc of proactiveConfigs) {
          if (pc.enabled) { await proactive.resetBackoff(chatId, pc.actorId,); }
        }

        // ── Slash command dispatch ────────────────────────────────
        const commandOutcome = await dispatchCommand(database, config, actorId, chatId, effectiveContent,);
        if (commandOutcome.handled) { return commandOutcome.response; }

        const { storedContent, contentEncoding, storedKeyId, } = await prepareContentStorage(
          database,
          config,
          chatId,
          actorId,
          filteredContent,
        );

        const id = uid();
        const parentId = body.parentId ?? null;
        let msgSwipeIndex: number | null = null;
        if (parentId) {
          const maxSwipe = await database
            .selectFrom("messages",)
            .select(database.fn.max("swipe_index",).as("max_idx",),)
            .where("chat_id", "=", chatId,)
            .where("parent_id", "=", parentId,)
            .executeTakeFirst();
          msgSwipeIndex = (maxSwipe?.max_idx ?? 0) + 1;
        }

        await database
          .insertInto("messages",)
          .values({
            id,
            chat_id: chatId,
            actor_id: actorId,
            parent_id: parentId,
            role: body.role ?? MessageRole.User,
            content: storedContent,
            key_id: storedKeyId,
            content_type: body.contentType ?? MessageContentType.Text,
            content_format: MessageContentFormat.Markdown,
            content_encoding: contentEncoding as ContentEncoding,
            status: MessageStatus.Confirmed,
            visibility: "visible",
            idempotency_key: body.idempotencyKey ?? null,
            swipe_index: msgSwipeIndex,
          },)
          .execute();

        const attachments = body.attachments;

        // ── Profanity moderation gate ─────────────────────────
        // When the admin `profanity_filter` toggle is enabled, hide profane
        // user messages behind moderation instead of silently censoring only.
        // The censor above still runs regardless; this adds an opt-in
        // flag/hide path (see docs/frontend/chat/assistant.md "moderation").
        if (hasProfanity) {
          const profanityFilter = (await getConfigValue(database, "profanity_filter",)) === "true";
          if (profanityFilter) {
            await updateMessageVisibility(database, id, "hidden_by_moderator", "profanity",);
          }
        }
        if (attachments && attachments.length > 0) {
          await attachMessageAttachments(database, id, attachments,);
        }

        // ── Persist initiative claim ────────────────────────────────
        if (isInitiative) {
          await persistInitiative(database, chatId, actorId,);
        }

        // ── Persist @mentions ─────────────────────────────────────
        await persistMentions(database, chatId, actorId, id, filteredContent,);

        // ── Auto-rename chat + detect scene transitions ─────────────────
        const chatRecord = await database
          .selectFrom("chats",)
          .select(["name", "mode", "current_location_id", "world_id",],)
          .where("id", "=", chatId,)
          .executeTakeFirst();
        await autoRenameChat(database, chatId, effectiveContent, chatRecord,);
        await handleSceneTransitions(database, config, chatId, actorId, effectiveContent, chatRecord, id,);

        // ── Context window stats ─────────────────────────────────────
        const tokenRow = await database
          .selectFrom("messages",)
          .select(database.fn.sum("token_count_total",).as("total_tokens",),)
          .where("chat_id", "=", chatId,)
          .executeTakeFirst();
        const usedTokens = Number(tokenRow?.total_tokens ?? 0,);
        const context = computeContextStats(
          [{ content: "", tokenCount: usedTokens, },],
        );

        // ── Auto-generation / assistant reply ──────────────────────
        const reply = await maybeAutoReply(
          database,
          config,
          chatId,
          actorId,
          id,
          effectiveContent,
          ctx.request as Request,
        );
        if (reply.replied) {
          return jsonCreated({ ...(await reply.response?.json?.()), context, },);
        }

        return jsonCreated({ id, context, },);
      },
      {
        params: ChatIdParams,
        body: MessageCreateBody,
        response: {
          201: t.Object({
            id: t.Optional(t.String(),),
            context: t.Object({
              used_tokens: t.Number(),
              max_tokens: t.Number(),
              percentage: t.Number(),
              will_trim: t.Boolean(),
              threshold: t.String(),
            },),
            assistantMessage: t.Optional(t.Object({
              id: t.String(),
              content: t.String(),
            },),),
          },),
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
      },
    )
    .use(createEntityConfirmRoutes(opts, prefix,),);
}

// ── NSFW user-message flag ─────────────────────────────────────

const NSFW_KEYWORDS = ["explicit", "graphic", "violent", "brutal", "gore", "torture", "mutilation",];
const RATING_ORDER = ["sfw", "nsfw_mild", "nsfw_moderate", "nsfw_intense", "nsfw_extreme",];

/**
 * Lightweight NSFW check on user-submitted messages.
 * Flags (warns) when content contains NSFW keywords and the user's max_rating
 * is below nsfw_intense. Does NOT suppress or block the message.
 */
async function flagNsfwUserMessage(
  database: HandlerOpts["database"],
  userId: string,
  chatId: string,
  content: string,
): Promise<void> {
  try {
    const userPrefs = await database
      .selectFrom("nsfw_user_preferences",)
      .select(["max_rating",],)
      .where("user_id", "=", userId,)
      .executeTakeFirst();
    const maxRating = userPrefs?.max_rating ?? "sfw";
    const lower = content.toLowerCase();
    let detectedNsfw = false;
    for (const kw of NSFW_KEYWORDS) {
      if (lower.includes(kw,)) {
        detectedNsfw = true;
        break;
      }
    }
    if (!detectedNsfw) { return; }
    const maxIndex = RATING_ORDER.indexOf(maxRating,);
    if (maxIndex === -1 || maxIndex >= RATING_ORDER.indexOf("nsfw_intense",)) { return; }
    getLogger().warn("nsfw: user message exceeds max rating", {
      userId,
      maxRating,
      chatId,
    },);
    const modService = new NsfwModerationService(database,);
    try {
      await modService.recordAction({
        actionType: "user_nsfw_warning",
        targetUserId: userId,
        performedBy: "system",
        reason: `User message contains NSFW keywords exceeding max_rating "${maxRating}"`,
        scope: "chat",
        scopeId: chatId,
      },);
    } catch {
      // audit logging failure is non-critical
    }
  } catch {
    // DB not available — skip silently
  }
}
