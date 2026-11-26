// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Message bulk actions: delete / move-to-section / export-selection.
 * Every id is checked against the same guard the single-message route uses;
 * a batch never widens access. Failures are reported per id, never swallowed.
 */
import { type Context, Elysia, t, } from "elysia";
import { checkChatAccess, } from "../../chat/service";
import { MessageRole, MessageStatus, MessageVisibility, } from "../../db/enums";
import { notFound, } from "../../validation/middleware";
import { ErrorResponse, } from "../../validation/schemas";
import { formatJson, formatMarkdown, } from "../chat-export/format";
import type { MessageData, } from "../chat-export/types";
import { chatAccess, } from "../chat-sections/access";
import { jsonResponse, requireUserId, } from "../http-utils";
import { authorizeMessageDelete, } from "./delete-authorization";
import { log, } from "./helpers";
import { resolveMessageContentForRender, } from "./render-message-content";
import type { HandlerOpts, } from "./types";

interface AuthContext {
  userId: string | null;
  userRole: string | null;
}
type Ctx = Context & AuthContext;

/** Body union of the three bulk endpoints; each handler reads its own fields. */
interface BulkBody {
  ids: string[];
  hard?: boolean;
  sectionId?: string | null;
  format?: "md" | "json";
}
type BulkCtx = Ctx & { params: { id: string }; body: BulkBody };

const BulkIds = t.Object({
  ids: t.Array(t.String(), { minItems: 1, maxItems: 200, },),
},);

const BulkDeleteBody = t.Object({
  ids: BulkIds.properties.ids,
  hard: t.Optional(t.Boolean(),),
},);

const BulkSectionBody = t.Object({
  ids: BulkIds.properties.ids,
  sectionId: t.Optional(t.Nullable(t.String(),),),
},);

const BulkExportBody = t.Object({
  ids: BulkIds.properties.ids,
  format: t.Union([t.Literal("md",), t.Literal("json",),],),
},);

const BulkFailure = t.Object({ id: t.String(), reason: t.String(), },);
const BulkResult = t.Object({
  ok: t.Boolean(),
  succeeded: t.Array(t.String(),),
  failed: t.Array(BulkFailure,),
},);

/**
 * @param opts
 * @param prefix
 * @returns Bulk action sub-plugin.
 */
export function bulkRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config, } = opts;

  return new Elysia({ name: "messages-bulk", },)
    .post(
      `${prefix}/chats/:id/messages/bulk/delete`,
      async (ctx,) => {
        const actorId = requireUserId(ctx,);
        if (typeof actorId !== "string") { return actorId; }
        const { params, body, userRole, } = ctx as unknown as BulkCtx;
        const chatId = params.id as string;
        if (!(await checkChatAccess(database, chatId, actorId, userRole,)).ok) {
          return notFound("Chat not found",);
        }

        const hard = body.hard === true;
        const succeeded: string[] = [];
        const failed: { id: string; reason: string }[] = [];
        for (const id of new Set(body.ids,)) {
          const auth = await authorizeMessageDelete(database, id, actorId, userRole,);
          // Cross-chat ids are rejected even when the caller can reach the
          // other chat — the batch must stay inside the path's chat.
          if (!auth.ok || auth.message.chat_id !== chatId) {
            failed.push({ id, reason: auth.ok ? "not_found" : auth.reason, },);
            continue;
          }

          if (hard) {
            await database.deleteFrom("messages",).where("id", "=", id,).execute();
          } else {
            await database
              .updateTable("messages",)
              .set({ visibility: "hidden_by_user", hidden_by: actorId, },)
              .where("id", "=", id,)
              .execute();
          }

          succeeded.push(id,);
        }

        log().info("Bulk message delete", { chatId, requested: body.ids.length, succeeded: succeeded.length, },);
        return jsonResponse({ ok: true, succeeded, failed, },);
      },
      {
        params: t.Object({ id: t.String(), },),
        body: BulkDeleteBody,
        response: { 200: BulkResult, 401: ErrorResponse, 404: ErrorResponse, },
      },
    )
    .post(
      `${prefix}/chats/:id/messages/bulk/section`,
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { params, body, userRole, } = ctx as unknown as BulkCtx;
        const chatId = params.id as string;
        if (!(await chatAccess(database, chatId, userId, userRole,))) {
          return notFound("Chat not found",);
        }

        const sectionId = body.sectionId ?? null;
        if (sectionId) {
          const section = await database
            .selectFrom("chat_sections",)
            .select("id",)
            .where("id", "=", sectionId,)
            .where("chat_id", "=", chatId,)
            .executeTakeFirst();

          if (!section) { return notFound("Section not found in this chat",); }
        }

        const succeeded: string[] = [];
        const failed: { id: string; reason: string }[] = [];
        for (const id of new Set(body.ids,)) {
          // Same message-in-chat check as the single assign route.
          const message = await database
            .selectFrom("messages",)
            .select("id",)
            .where("id", "=", id,)
            .where("chat_id", "=", chatId,)
            .executeTakeFirst();

          if (!message) {
            failed.push({ id, reason: "not_found", },);
            continue;
          }

          await database.updateTable("messages",).set({ section_id: sectionId, },).where("id", "=", id,).execute();
          succeeded.push(id,);
        }

        return jsonResponse({ ok: true, succeeded, failed, },);
      },
      {
        params: t.Object({ id: t.String(), },),
        body: BulkSectionBody,
        response: { 200: BulkResult, 401: ErrorResponse, 404: ErrorResponse, },
      },
    )
    .post(
      `${prefix}/chats/:id/messages/bulk/export`,
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { params, body, userRole, } = ctx as unknown as BulkCtx;
        const chatId = params.id as string;
        if (!(await checkChatAccess(database, chatId, userId, userRole,)).ok) {
          return notFound("Chat not found",);
        }

        const chat = await database
          .selectFrom("chats",)
          .select(["id", "name", "type", "mode", "created_at",],)
          .where("id", "=", chatId,)
          .executeTakeFirst();

        if (!chat) { return notFound("Chat not found",); }

        const rows = await database
          .selectFrom("messages",)
          .innerJoin("actors", "actors.id", "messages.actor_id",)
          .select([
            "messages.id",
            "messages.chat_id",
            "messages.content",
            "messages.content_encoding",
            "messages.key_id",
            "messages.role",
            "messages.created_at",
            "messages.model_id",
            "messages.token_count_total",
            "actors.display_name",
          ],)
          .where("messages.chat_id", "=", chatId,)
          .where("messages.id", "in", [...new Set(body.ids,),],)
          .where("messages.status", "=", MessageStatus.Confirmed,)
          .where("messages.visibility", "=", MessageVisibility.Visible,)
          .where("messages.role", "in", [MessageRole.User, MessageRole.Assistant, MessageRole.Character,],)
          .orderBy("messages.created_at", "asc",)
          .execute();

        // Same decrypt + render-time transform path as a full chat export:
        // never emit raw ciphertext for an encrypted chat.
        const transforms = config?.generation?.regexTransforms ?? [];
        const messages: MessageData[] = [];
        for (const row of rows) {
          let content: string;
          try {
            content = await resolveMessageContentForRender(database, row, transforms,);
          } catch {
            content = "[Encrypted — unable to decrypt]";
          }

          messages.push({
            id: row.id,
            content,
            role: row.role,
            created_at: row.created_at,
            display_name: row.display_name,
            model_id: row.model_id,
            token_count_total: row.token_count_total,
          },);
        }

        const isJson = body.format === "json";
        const safeName = chat.name.replaceAll(/[^a-z0-9]/gi, "_",);
        return new Response(
          isJson ? formatJson(chat, messages,) : formatMarkdown(chat, messages,),
          {
            headers: {
              "Content-Type": isJson ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8",
              "Content-Disposition": `attachment; filename="${safeName}-selection.${isJson ? "json" : "md"}"`,
            },
          },
        );
      },
      {
        params: t.Object({ id: t.String(), },),
        body: BulkExportBody,
        response: { 401: ErrorResponse, 404: ErrorResponse, },
      },
    );
}
