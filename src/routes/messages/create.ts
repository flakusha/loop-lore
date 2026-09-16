// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { getConfigValue, } from "../../admin/config";
import { computeContextStats, } from "../../chat";
import { ProactiveMessagingService, } from "../../chat/proactive";
import { checkChatAccess, updateMessageVisibility, } from "../../chat/service";
import type { ContentEncoding, } from "../../db/enums";
import { parseInitiativeFlag, } from "../../group-chat/mention-parser";
import { containsProfanity, filter as filterProfanity, } from "../../profanity/service";
import { uid, } from "../../utils";
import { ChatIdParams, ErrorResponse, MessageCreateBody, } from "../../validation/schemas";
import { badRequestResponse, jsonCreated, jsonResponse, requireUserId, } from "../http-utils";
import type { HttpStatusCode, } from "../http-utils";
import { dispatchCommand, } from "./command";
import { createEntityConfirmRoutes, } from "./create-entity-confirm";
import { attachAttachmentsOrForbidden, enforceInjectionGate, } from "./guards";
import { serviceErrorToResponse, } from "./helpers";
import { persistInitiative, } from "./initiative";
import { flagNsfwUserMessage, } from "./nsfw-user-flag";
import { ParentMessageNotFoundError, ParentMessageNotInChatError, } from "./parent-message-errors";
import { persistMentions, prepareContentStorage, } from "./post";
import { runPostInsertChatEffects, } from "./post-insert";
import { maybeAutoReply, } from "./reply";
import { findByIdempotencyKey, insertUserMessageWithRetry, SwipeInsertExhaustedError, } from "./swipe-race-insert";
import { translateInboundContent, } from "./translate-inbound";
import type { HandlerOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 */
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
        // BUG-message-whitespace-only-accepted: trim content and reject
        // whitespace-only payloads before any side effect (access check,
        // NSFW flag, profanity filter). Trailing/leading whitespace is
        // normalized here; mid-string whitespace is preserved.
        const trimmedContent = body.content.trim();
        if (trimmedContent.length === 0) {
          return badRequestResponse("Message content cannot be empty or whitespace-only.",);
        }
        const effectiveBody = { ...body, content: trimmedContent, };
        void body;

        // ── Access check before any side effects ───────────────────
        // Must run before NSFW flagging / profanity filtering so a
        // non-participant cannot trigger moderation writes scoped to an
        // arbitrary chatId (BUG-nsfw-flag-side-effect-runs-before-access-check).
        const access = await checkChatAccess(database, chatId, actorId, ctx.userRole as string | null,);
        if (!access.ok) { return serviceErrorToResponse(access.error,); }

        const filteredContent = filterProfanity(effectiveBody.content,);
        const hasProfanity = containsProfanity(effectiveBody.content,);

        // ── NSFW content check on user message ─────────────────────
        // Lightweight flag/warn — does not suppress the message, just logs
        // when user-submitted content exceeds their max rating.
        await flagNsfwUserMessage(database, actorId, chatId, effectiveBody.content,);

        // ── Two-step prompt/message injection validation ─────────────
        // Opt-in via hooks.enableModerationHooks; a blocked verdict here
        // returns 403 before any message row is written.
        const injectionRejection = await enforceInjectionGate(
          config,
          database,
          effectiveBody.content,
          actorId,
          chatId,
        );
        if (injectionRejection) { return injectionRejection; }

        const { isInitiative, cleanMessage, } = parseInitiativeFlag(filteredContent,);
        const effectiveContent = isInitiative ? cleanMessage : filteredContent;

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

        // Per-chat auto-translation (inbound) — opt-in; degrades to original.
        const storableContent = await translateInboundContent(database, config, chatId, actorId, filteredContent,);

        const { storedContent, contentEncoding, storedKeyId, storedPlaintext, } = await prepareContentStorage(
          database,
          config,
          chatId,
          actorId,
          storableContent,
        );

        const id = uid();
        const parentId = body.parentId ?? null;
        // ── Idempotency: short-circuit if a row already covers this key.
        // Closes the duplicate-insert hazard for retried POSTs. The key is
        // optional; the helper handles null by returning null.
        const idempotencyKey = body.idempotencyKey ?? null;
        const existingId = idempotencyKey
          ? await findByIdempotencyKey(database, chatId, idempotencyKey,)
          : null;
        if (existingId) {
          return jsonCreated({ id: existingId, context: {}, },);
        }
        // ── Cross-chat parentId IDOR guard (BUG-cross-chat-parentId-IDOR) ──
        // Verify the parent message actually belongs to the target chat INSIDE
        // the same transaction as the INSERT, eliminating the TOCTOU window
        // between SELECT and INSERT. A parent from a different chat → 403;
        // a missing parent → 404. Both return before any row is written.
        try {
          await database.transaction().execute(async (trx,) => {
            if (parentId !== null) {
              const parent = await trx
                .selectFrom("messages",)
                .select("chat_id",)
                .where("id", "=", parentId,)
                .executeTakeFirst();
              if (!parent) {
                ctx.set.status = 404;
                throw new ParentMessageNotFoundError();
              }
              if (parent.chat_id !== chatId) {
                ctx.set.status = 403;
                throw new ParentMessageNotInChatError();
              }
            }
            await insertUserMessageWithRetry(trx, {
              id,
              chatId,
              actorId,
              parentId,
              storedContent,
              storedKeyId,
              storedPlaintext,
              contentEncoding: contentEncoding as ContentEncoding,
              idempotencyKey,
            },);
          },);
        } catch (err) {
          if (err instanceof ParentMessageNotFoundError) {
            return jsonResponse(
              { error: "parent_message_not_found", message: "parentId does not reference any message.", },
              404 as HttpStatusCode,
            );
          }
          if (err instanceof ParentMessageNotInChatError) {
            return jsonResponse(
              { error: "parent_message_not_in_chat", message: "parentId belongs to a different chat.", },
              403 as HttpStatusCode,
            );
          }
          if (err instanceof SwipeInsertExhaustedError) {
            return jsonResponse(
              { error: "service_busy", message: err.message, },
              503 as HttpStatusCode,
            );
          }
          throw err;
        }
        const attachments = body.attachments;

        // ── Profanity moderation gate ─────────────────────────
        if (hasProfanity) {
          const profanityFilter = (await getConfigValue(database, "profanity_filter",)) === "true";
          if (profanityFilter) {
            await updateMessageVisibility(database, id, "hidden_by_moderator", "profanity",);
          }
        }
        if (attachments && attachments.length > 0) {
          const attachmentRejection = await attachAttachmentsOrForbidden(database, id, attachments, actorId,);
          if (attachmentRejection) { return attachmentRejection; }
        }

        // ── Persist initiative claim ────────────────────────────────
        if (isInitiative) {
          await persistInitiative(database, chatId, actorId,);
        }

        // ── Persist @mentions ─────────────────────────────────────
        await persistMentions(database, chatId, actorId, id, filteredContent,);

        // ── Post-insert chat effects: rename, advisory AUX title, scene transitions ──
        const chatRecord = await database
          .selectFrom("chats",)
          .select(["name", "mode", "current_location_id", "world_id", "created_by",],)
          .where("id", "=", chatId,)
          .executeTakeFirst();
        await runPostInsertChatEffects(database, config, chatId, actorId, id, effectiveContent, chatRecord,);

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
          opts.asyncStore,
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
          201: t.Object({ id: t.String(), context: t.Any(), },),
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
          503: ErrorResponse,
        },
      },
    )
    .use(createEntityConfirmRoutes(opts, prefix,),);
}
