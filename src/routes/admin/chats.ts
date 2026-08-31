// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { can, } from "../../users/permissions";
import {
  AdminChatUpdateBody,
  ChatIdParams,
  ErrorResponse,
  PaginationQuery,
  SuccessResponse,
} from "../../validation/schemas";
import { AdminChatRow, AdminPaginatedEnvelope, } from "../../validation/schemas/responses";
import { ErrorCode, HttpStatus, jsonError, jsonNoContent, jsonResponse, parsePagination, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 */
export function chatsRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-chats", },)
      // ── Chat management ────────────────────────────────────
      .get(
        `${prefix}/admin/chats`,
        async (ctx: any,) => {
          const { userRole, } = ctx;
          if (!can(userRole, "admin.system",)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }
          const url = new URL(ctx.request.url,);
          const { page, pageSize, } = parsePagination(url.searchParams,);
          const offset = (page - 1) * pageSize;
          const q = url.searchParams.get("q",);
          const typeFilter = url.searchParams.get("type",);

          let countQuery = opts.database
            .selectFrom("chats",)
            .select(opts.database.fn.countAll<number>().as("total",),);
          let listQuery = opts.database
            .selectFrom("chats",)
            .select(["id", "name", "type", "created_by", "world_id", "is_pinned", "created_at", "updated_at",],)
            .orderBy("created_at", "desc",)
            .limit(pageSize,)
            .offset(offset,);

          if (q) {
            const like = `%${q}%`;
            countQuery = countQuery.where("name", "like", like,);
            listQuery = listQuery.where("name", "like", like,);
          }
          if (typeFilter) {
            countQuery = countQuery.where("type", "=", typeFilter as any,);
            listQuery = listQuery.where("type", "=", typeFilter as any,);
          }

          const countResult = await countQuery.executeTakeFirst();
          const total = countResult?.total ?? 0;
          const chats = await listQuery.execute();

          return jsonResponse({ data: chats, total, page, pageSize, },);
        },
        {
          query: PaginationQuery,
          response: {
            200: AdminPaginatedEnvelope(AdminChatRow,),
            403: ErrorResponse,
          },
        },
      )
      .get(
        `${prefix}/admin/chats/:id`,
        async (ctx: any,) => {
          const { params: p, userRole, } = ctx;
          if (!can(userRole, "admin.system",)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }
          const { id, } = p as { id: string };
          const chat = await opts.database
            .selectFrom("chats",)
            .selectAll()
            .where("id", "=", id,)
            .executeTakeFirst();
          if (!chat) {
            return jsonError({
              message: ctx.t?.("admin.chatNotFound",) ?? "Chat not found",
              status: HttpStatus.NotFound,
              code: ErrorCode.NotFound,
            },);
          }

          const msgCount = await opts.database
            .selectFrom("messages",)
            .select(opts.database.fn.countAll<number>().as("n",),)
            .where("chat_id", "=", id,)
            .executeTakeFirst();

          const participants = await opts.database
            .selectFrom("chat_participants",)
            .select(["actor_id", "role_in_chat", "joined_at",],)
            .where("chat_id", "=", id,)
            .execute();

          return jsonResponse({
            ...chat,
            messageCount: msgCount?.n ?? 0,
            participants,
          },);
        },
        { params: ChatIdParams, response: { 200: t.Any(), 403: ErrorResponse, 404: ErrorResponse, }, },
      )
      .patch(
        `${prefix}/admin/chats/:id`,
        async (ctx: any,) => {
          const { params: p, userRole, body, } = ctx;
          if (!can(userRole, "admin.system",)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }
          const { id, } = p as { id: string };
          const { is_pinned, world_id, } = body as { is_pinned?: string; world_id?: string | null };
          const updates: Record<string, unknown> = {};
          if (is_pinned !== undefined) { updates.is_pinned = is_pinned; }
          if (world_id !== undefined) { updates.world_id = world_id; }
          if (Object.keys(updates,).length === 0) {
            return jsonError({
              message: ctx.t?.("admin.noUpdatableFields",) ?? "No updatable fields",
              status: HttpStatus.BadRequest,
            },);
          }
          await opts.database
            .updateTable("chats",)
            .set(updates as any,)
            .where("id", "=", id,)
            .execute();
          return jsonResponse({ ok: true, },);
        },
        {
          body: AdminChatUpdateBody,
          params: ChatIdParams,
          response: { 200: SuccessResponse, 400: ErrorResponse, 403: ErrorResponse, },
        },
      )
      .delete(
        `${prefix}/admin/chats/:id`,
        async (ctx: any,) => {
          const { params: p, userRole, } = ctx;
          if (!can(userRole, "admin.system",)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }
          const { id, } = p as { id: string };
          await opts.database.deleteFrom("chats",).where("id", "=", id,).execute();
          return jsonNoContent();
        },
        { params: ChatIdParams, response: { 204: t.Void(), 403: ErrorResponse, }, },
      )
  );
}
