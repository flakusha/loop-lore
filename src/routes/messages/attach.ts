// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Message Attachments — attach an owned gallery asset to an already-sent
 * message (TASK-chat-feature-component-buttons AC1/AC3/AC4: the action-row
 * `Attach` button). The endpoint only needs an `assetId`, so it stays
 * kind-agnostic and the picker frontend decides which kinds are offered.
 */
import { Elysia, t, } from "elysia";
import { linkAsset, } from "../../assets/service";
import { checkChatAccess, } from "../../chat/service";
import { jsonParseOr, safeJsonStringify, } from "../../utils";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import {
  badRequestResponse,
  extractAuth,
  jsonCreated,
  jsonResponse,
  notFoundResponse,
  requireUserId,
} from "../http-utils";
import { AttachmentOwnershipError, verifyAttachmentsOwned, } from "./attachment-ownership";
import { log, } from "./helpers";
import type { HandlerOpts, } from "./types";

/** One persisted attachment row inside `messages.attachments`. */
interface MessageAttachment {
  assetId: string;
  order: number;
  caption: string;
  label: string;
}

/**
 * Attach routes — `POST /messages/:id/attachments`.
 *
 * Access follows the read path (message existence is not leaked to
 * outsiders: no chat access → 404). Asset ownership is enforced by
 * `verifyAttachmentsOwned`; `linkAsset` swallows duplicate links, so a
 * retried attach is idempotent end-to-end.
 * @param opts
 * @param prefix
 * @returns Elysia plugin serving the attach endpoint
 */
export function attachRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "messages-attach", },)
    .post(
      `${prefix}/messages/:id/attachments`,
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { id, } = ctx.params;
        const { assetId, } = ctx.body;
        const { userRole, } = extractAuth(ctx,);

        const message = await database
          .selectFrom("messages",)
          .select(["id", "chat_id", "attachments",],)
          .where("id", "=", id,)
          .executeTakeFirst();
        if (!message) { return notFoundResponse("Message not found",); }

        const access = await checkChatAccess(database, message.chat_id, userId, userRole,);
        if (!access.ok) { return notFoundResponse("Message not found",); }

        try {
          await verifyAttachmentsOwned(database, [{ assetId, }], userId,);
        } catch (err) {
          if (err instanceof AttachmentOwnershipError) {
            return badRequestResponse("Asset not found or not owned by you.",);
          }
          throw err;
        }

        const current = jsonParseOr<MessageAttachment[]>(message.attachments ?? "[]", [],);
        const existing = Array.isArray(current,) ? current : [];
        if (existing.some((a,) => a.assetId === assetId,)) {
          // Idempotent: a retried attach returns the unchanged list.
          return jsonResponse({ data: existing, },);
        }

        const merged: MessageAttachment[] = [
          ...existing,
          { assetId, order: existing.length, caption: "", label: "message-attachment", },
        ];
        const serialized = safeJsonStringify(merged,);
        if (!serialized.ok) {
          return badRequestResponse("Failed to serialize attachments.",);
        }

        try {
          await linkAsset({
            database,
            assetId,
            link: { entityType: "message", entityId: id, label: "message-attachment", },
          },);
          await database
            .updateTable("messages",)
            .set({ attachments: serialized.value, },)
            .where("id", "=", id,)
            .execute();
        } catch (err) {
          log().error("message attach failed", { messageId: id, assetId, error: String(err,), },);
          throw err;
        }

        return jsonCreated({ data: merged, },);
      },
      {
        params: t.Object({ id: t.String(), },),
        body: t.Object({ assetId: t.String({ minLength: 1, },), },),
        response: {
          201: SuccessResponse,
          400: ErrorResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
      },
    );
}