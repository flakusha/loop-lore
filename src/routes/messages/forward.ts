// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Message forwarding across chats.
 *
 * Copies one message into another chat the caller can access: the source
 * is decrypted with the source chat's keys and re-encrypted for the
 * target (ciphertext is never copied verbatim), attribution is stored as
 * a `> Forwarded from …` body prefix (no schema change, FTS-safe), and
 * only caller-owned attachments travel (foreign ones are counted as
 * dropped, never leaked).
 *
 * Deliberately narrower than a fresh send: no slash-command dispatch, no
 * @mention persistence, no scene transitions, and no assistant
 * auto-reply — a forward is a copy operation. Profanity filtering and
 * the NSFW user-message flag still run so target-chat policy holds.
 * Single message per call, so no batch cap is needed.
 */
import { Elysia, t, } from "elysia";
import { getConfigValue, } from "../../admin/config";
import { checkChatAccess, updateMessageVisibility, } from "../../chat/service";
import type { ContentEncoding, } from "../../db/enums";
import { containsProfanity, filter as filterProfanity, } from "../../profanity/service";
import { uid, } from "../../utils";
import { ErrorResponse, MessageForwardBody, } from "../../validation/schemas";
import { Id, } from "../../validation/schemas/primitives";
import { badRequestResponse, jsonCreated, jsonResponse, requireUserId, } from "../http-utils";
import type { HttpStatusCode, } from "../http-utils";
import { attachAttachmentsOrForbidden, } from "./guards";
import { serviceErrorToResponse, } from "./helpers";
import { flagNsfwUserMessage, } from "./nsfw-user-flag";
import { prepareContentStorage, } from "./post";
import { loadSourcePlaintext, } from "./source-message";
import { findByIdempotencyKey, insertUserMessageWithRetry, SwipeInsertExhaustedError, } from "./swipe-race-insert";
import type { HandlerOpts, } from "./types";

const ForwardParams = t.Object({
  id: Id,
  mid: Id,
},);

/**
 * @param opts
 * @param prefix
 * @returns Elysia plugin serving the forward endpoint
 */
export function forwardRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config, } = opts;

  return new Elysia({ name: "messages-forward", },)
    .post(
      `${prefix}/chats/:id/messages/:mid/forward`,
      async (ctx: any,) => {
        const actorId = requireUserId(ctx,);
        if (typeof actorId !== "string") { return actorId; }
        const { id: sourceChatId, mid: messageId, } = ctx.params as { id: string; mid: string };
        const body = ctx.body as typeof MessageForwardBody.static;
        const targetChatId = body.targetChatId;

        // Source access first so a non-participant cannot probe message ids.
        const loaded = await loadSourcePlaintext(database, {
          chatId: sourceChatId,
          messageId,
          actorId,
          userRole: ctx.userRole as string | null,
        },);
        if (!loaded.ok) { return loaded.response; }
        const { plaintext, senderName, } = loaded;

        const targetAccess = await checkChatAccess(database, targetChatId, actorId, ctx.userRole as string | null,);
        if (!targetAccess.ok) { return serviceErrorToResponse(targetAccess.error,); }

        const filteredContent = filterProfanity(plaintext,);
        const hasProfanity = containsProfanity(plaintext,);
        await flagNsfwUserMessage(database, actorId, targetChatId, plaintext,);

        const links = await database
          .selectFrom("asset_links",)
          .select(["asset_id", "label", "sort_order",],)
          .where("entity_type", "=", "message",)
          .where("entity_id", "=", messageId,)
          .orderBy("sort_order",)
          .execute();
        const ownedIds = new Set<string>();
        if (links.length > 0) {
          const assets = await database
            .selectFrom("assets",)
            .select(["id", "owner_id",],)
            .where("id", "in", links.map((l,) => l.asset_id,),)
            .execute();
          for (const a of assets) {
            if (a.owner_id === actorId) { ownedIds.add(a.id,); }
          }
        }
        const forwardable = links
          .filter((l,) => ownedIds.has(l.asset_id,),)
          .map((l, i,) => ({ assetId: l.asset_id, order: i, label: l.label ?? "message-attachment", }),);
        const droppedAttachments = links.length - forwardable.length;

        if (filteredContent.trim().length === 0 && forwardable.length === 0) {
          return badRequestResponse("Nothing to forward: empty content and no owned attachments.",);
        }
        const forwardedContent = `> Forwarded from ${senderName}\n\n${filteredContent}`;

        const { storedContent, contentEncoding, storedKeyId, storedPlaintext, } = await prepareContentStorage(
          database,
          config,
          targetChatId,
          actorId,
          forwardedContent,
        );

        const id = uid();
        const idempotencyKey = body.idempotencyKey ?? null;
        const existingId = idempotencyKey
          ? await findByIdempotencyKey(database, targetChatId, idempotencyKey,)
          : null;
        if (existingId) {
          return jsonCreated({ id: existingId, droppedAttachments: 0, },);
        }
        try {
          await insertUserMessageWithRetry(database, {
            id,
            chatId: targetChatId,
            actorId,
            parentId: null,
            storedContent,
            storedKeyId,
            storedPlaintext,
            contentEncoding: contentEncoding as ContentEncoding,
            idempotencyKey,
          },);
        } catch (err) {
          if (err instanceof SwipeInsertExhaustedError) {
            return jsonResponse(
              { error: "service_busy", message: err.message, },
              503 as HttpStatusCode,
            );
          }
          throw err;
        }

        if (hasProfanity) {
          const profanityFilter = (await getConfigValue(database, "profanity_filter",)) === "true";
          if (profanityFilter) {
            await updateMessageVisibility(database, id, "hidden_by_moderator", "profanity",);
          }
        }
        if (forwardable.length > 0) {
          const attachmentRejection = await attachAttachmentsOrForbidden(database, id, forwardable, actorId,);
          if (attachmentRejection) { return attachmentRejection; }
        }

        return jsonCreated({ id, droppedAttachments, },);
      },
      {
        params: ForwardParams,
        body: MessageForwardBody,
        response: {
          201: t.Object({ id: t.String(), droppedAttachments: t.Number(), },),
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
          422: ErrorResponse,
          503: ErrorResponse,
        },
      },
    );
}
