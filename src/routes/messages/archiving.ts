// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { ARCHIVE_RETENTION_DAYS_DEFAULT, getConfigValue, } from "../../admin/config";
import { getLogger, } from "../../logger";
import { can, } from "../../users/permissions";
import { notFound, } from "../../validation/middleware";
import { ChatIdParams, ErrorResponse, MessageIdParams, SuccessResponse, } from "../../validation/schemas";
import { jsonResponse, requireUserId, } from "../http-utils";
import type { HandlerOpts, } from "./types";

/**
 * Resolve the archive purge retention window from its admin-config value.
 * Falls back to `ARCHIVE_RETENTION_DAYS_DEFAULT` when unset, non-numeric, or
 * < 1 — a non-positive window would purge every archived message.
 * @param raw - Raw `archive_retention_days` system_config value, if seeded.
 * @returns Retention window in days.
 */
function resolveArchiveRetentionDays(raw: string | undefined,): number {
  const parsed = Number(raw,);
  return Number.isFinite(parsed,) && parsed >= 1 ? parsed : ARCHIVE_RETENTION_DAYS_DEFAULT;
}

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { messages: { ":id": { ...; }; }; }; } & { ...; } & { ...; }, { ...; }, { ...; }>}
 */
export function archivingRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "messages-archiving", },)
    .post(
      `${prefix}/messages/:id/archive`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const id = (ctx.params as { id: string }).id;

        const message = await database
          .selectFrom("messages",)
          .selectAll()
          .where("id", "=", id,)
          .executeTakeFirst();

        if (!message) { return notFound(ctx.t?.("messages.messageNotFound",) ?? "Message not found",); }
        const chat = await database
          .selectFrom("chats",)
          .select("created_by",)
          .where("id", "=", message.chat_id,)
          .executeTakeFirst();

        if (!chat || (chat.created_by !== userId && !can(ctx.userRole as string | null, "admin.chat",))) {
          return notFound(ctx.t?.("messages.messageNotFound",) ?? "Message not found",);
        }

        await database
          .updateTable("messages",)
          .set({ archived_at: new Date().toISOString(), visibility: "auto_hidden", },)
          .where("id", "=", id,)
          .execute();

        return jsonResponse({ ok: true, },);
      },
      { params: MessageIdParams, response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, }, },
    )
    .post(
      `${prefix}/messages/:id/restore`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const id = (ctx.params as { id: string }).id;

        const message = await database
          .selectFrom("messages",)
          .selectAll()
          .where("id", "=", id,)
          .executeTakeFirst();

        if (!message) { return notFound(ctx.t?.("messages.messageNotFound",) ?? "Message not found",); }
        const chat = await database
          .selectFrom("chats",)
          .select("created_by",)
          .where("id", "=", message.chat_id,)
          .executeTakeFirst();

        if (!chat || (chat.created_by !== userId && !can(ctx.userRole as string | null, "admin.chat",))) {
          return notFound(ctx.t?.("messages.messageNotFound",) ?? "Message not found",);
        }

        await database
          .updateTable("messages",)
          .set({ archived_at: null, visibility: "visible", },)
          .where("id", "=", id,)
          .execute();

        return jsonResponse({ ok: true, },);
      },
      { params: MessageIdParams, response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, }, },
    )
    .post(
      `${prefix}/chats/:id/messages/purge`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { id: chatId, } = ctx.params as { id: string };

        const chat = await database
          .selectFrom("chats",)
          .select("created_by",)
          .where("id", "=", chatId,)
          .executeTakeFirst();

        if (!chat || (chat.created_by !== userId && !can(ctx.userRole as string | null, "admin.chat",))) {
          return notFound(ctx.t?.("messages.chatNotFound",) ?? "Chat not found",);
        }

        const retentionDays = resolveArchiveRetentionDays(await getConfigValue(database, "archive_retention_days",),);
        const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000,).toISOString();

        // FK-safe purge (BUG-chat-minors-variant): messages.parent_id and
        // chat_branches.parent_message_id both reference messages.id with no
        // cascade, so a bulk delete that takes a still-referenced row aborts
        // with an FK error (500). Refuse structural rows instead — keep them
        // archived — delete the rest leaf-first, and clean their asset_links
        // rows in the SAME transaction so no dangling links survive.
        const purged = await database.transaction().execute(async (trx,) => {
          const candidates = await trx
            .selectFrom("messages",)
            .select(["id", "parent_id",],)
            .where("chat_id", "=", chatId,)
            .where("archived_at", "is not", null,)
            .where("archived_at", "<", cutoff,)
            .execute();

          if (candidates.length === 0) { return 0; }

          const purgeable = new Set(candidates.map((row,) => row.id),);
          const parentOf = new Map(candidates.map((row,) => [row.id, row.parent_id,] as const),);

          // Rows referenced from OUTSIDE the purge set are structural:
          // surviving children (parent_id) and branch fork-points.
          const childRefs = await trx
            .selectFrom("messages",)
            .select("parent_id",)
            .where("parent_id", "is not", null,)
            .where("chat_id", "=", chatId,)
            .execute();

          const branchRefs = await trx
            .selectFrom("chat_branches",)
            .select("parent_message_id",)
            .where("chat_id", "=", chatId,)
            .execute();

          const blocked = new Set<string>();
          for (const ref of childRefs) {
            if (ref.parent_id && !purgeable.has(ref.parent_id,)) { blocked.add(ref.parent_id,); }
          }

          for (const ref of branchRefs) {
            blocked.add(ref.parent_message_id,);
          }

          // Delete leaf-first so a parent never outlives a child inside the
          // purge set (immediate FK enforcement). childCount tracks remaining
          // in-set children per parent so each pass is O(n), not O(n²).
          const childCount = new Map<string, number>();
          for (const parentId of parentOf.values()) {
            if (parentId) { childCount.set(parentId, (childCount.get(parentId,) ?? 0) + 1,); }
          }

          let deleted = 0;
          const remaining = new Set(purgeable,);
          while (remaining.size > 0) {
            const deletable: string[] = [];
            for (const id of remaining) {
              if (blocked.has(id,)) { continue; }
              if ((childCount.get(id,) ?? 0) === 0) { deletable.push(id,); }
            }

            if (deletable.length === 0) { break; }

            await trx.deleteFrom("messages",).where("id", "in", deletable,).execute();
            await trx
              .deleteFrom("asset_links",)
              .where("entity_type", "=", "message",)
              .where("entity_id", "in", deletable,)
              .execute();

            deleted += deletable.length;
            for (const id of deletable) {
              remaining.delete(id,);
              const parentId = parentOf.get(id,);
              if (parentId) { childCount.set(parentId, childCount.get(parentId,)! - 1,); }
            }
          }

          if (remaining.size > 0) {
            getLogger().child({ module: "messages.archiving", },).warn(
              "purge skipped structurally-referenced archived messages",
              { chatId, skipped: remaining.size, },
            );
          }

          return deleted;
        },);

        return jsonResponse({ ok: true, purged, },);
      },
      { params: ChatIdParams, response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, }, },
    );
}
