import { Elysia, t, } from "elysia";
import { getConfigValue, } from "../../admin/config";
import { checkChatAccess, updateMessageVisibility, } from "../../chat/service";
import {
  MessageContentFormat,
  MessageContentType,
  MessageRole,
} from "../../db/enums";
import type { ContentEncoding, } from "../../db/enums";
import { parseInitiativeFlag, } from "../../group-chat/mention-parser";
import { containsProfanity, filter as filterProfanity, } from "../../profanity/service";
import { uid, } from "../../utils";
import { ChatIdParams, ErrorResponse, MessageCreateBody, } from "../../validation/schemas";
import { jsonCreated, requireUserId, } from "../http-utils";
import { dispatchCommand, } from "./command";
import { serviceErrorToResponse, } from "./helpers";
import { attachMessageAttachments, persistInitiative, persistMentions, prepareContentStorage, } from "./post";
import { maybeAutoReply, } from "./reply";
import { autoRenameChat, handleSceneTransitions, } from "./transitions";
import type { HandlerOpts, } from "./types";

export function createRoutes(opts: HandlerOpts, prefix = "/api") {
  const { database, config, } = opts;

  return new Elysia({ name: "messages-create", },)
    .post(
      prefix + "/chats/:id/messages",
      async (ctx: any,) => {
        const actorId = requireUserId(ctx,);
        if (typeof actorId !== "string") { return actorId; }
        const { id: chatId, } = ctx.params as { id: string };
        const body = ctx.body as typeof MessageCreateBody.static;

        const filteredContent = filterProfanity(body.content,);
        const hasProfanity = containsProfanity(body.content,);
        const { isInitiative, cleanMessage, } = parseInitiativeFlag(filteredContent,);
        const effectiveContent = isInitiative ? cleanMessage : filteredContent;

        const access = await checkChatAccess(database, chatId, actorId, ctx.userRole as string | null,);
        if (!access.ok) { return serviceErrorToResponse(access.error,); }

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
            status: "confirmed",
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
        await handleSceneTransitions(database, config, chatId, actorId, effectiveContent, chatRecord,);

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
        if (reply.replied) { return reply.response; }

        return jsonCreated({ id, },);
      },
      {
        params: ChatIdParams,
        body: MessageCreateBody,
        response: {
          201: t.Object({ id: t.String(), },),
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
      },
    );
}
