// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { can, } from "../../users/permissions";
import { ErrorResponse, PaginationQuery, } from "../../validation/schemas";
import { AdminAuditRow, AdminPaginatedEnvelope, } from "../../validation/schemas/responses";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, parsePagination, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 */
export function auditRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-audit", },)
      // ── Audit log ──────────────────────────────────────────
      .get(
        `${prefix}/admin/audit`,
        async (ctx: any,) => {
          const { userRole, request, } = ctx;
          if (!can(userRole, "admin.system",)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }
          const url = new URL(request.url,);
          const { page, pageSize, } = parsePagination(url.searchParams,);
          const offset = (page - 1) * pageSize;
          const eventType = url.searchParams.get("event_type",);
          const userIdFilter = url.searchParams.get("user_id",);
          const entityType = url.searchParams.get("entity_type",);
          // Cap `q` to prevent LIKE-DoS on large audit tables; long LIKE
          // patterns with leading wildcards scan every row.
          const rawQ = url.searchParams.get("q",);
          const q = rawQ && rawQ.length > 200 ? rawQ.slice(0, 200,) : rawQ;

          // NSFW gate events (`nsfw.gate.*`) carry hashed user/chat identifiers and
          // the closed-enum gate reason. Reading them requires the dedicated
          // `admin.audit.nsfw` capability on top of `admin.system`.
          const isNsfwEventQuery = eventType?.startsWith("nsfw.gate.",) ?? false;
          if (isNsfwEventQuery && !can(userRole, "admin.audit.nsfw",)) {
            return jsonError({
              message: ctx.t?.("admin.nsfwAuditAccessRequired",) ?? "NSFW audit access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }
          let query = opts.database
            .selectFrom("log_entries",)
            .select([
              "id",
              "level",
              "message",
              "module",
              "event_type",
              "entity_type",
              "entity_id",
              "user_id",
              "session_id",
              "request_id",
              "meta",
              "action",
              "timestamp",
              "time",
              "created_at",
            ],)
            .orderBy("created_at", "desc",)
            .limit(pageSize,)
            .offset(offset,);

          if (eventType) {
            query = query.where("event_type", "=", eventType,);
          }
          if (userIdFilter) {
            query = query.where("user_id", "=", userIdFilter,);
          }
          if (entityType) {
            query = query.where("entity_type", "=", entityType,);
          }
          if (q) {
            const like = `%${q}%`;
            query = query.where("message", "like", like,);
          }

          const entries = await query.execute();

          let countQuery = opts.database
            .selectFrom("log_entries",)
            .select(opts.database.fn.countAll<number>().as("total",),);
          if (eventType) {
            countQuery = countQuery.where("event_type", "=", eventType,);
          }
          if (userIdFilter) {
            countQuery = countQuery.where("user_id", "=", userIdFilter,);
          }
          if (entityType) {
            countQuery = countQuery.where("entity_type", "=", entityType,);
          }
          if (q) {
            const like = `%${q}%`;
            countQuery = countQuery.where("message", "like", like,);
          }
          const countResult = await countQuery.executeTakeFirst();
          const total = countResult?.total ?? 0;

          return jsonResponse({ data: entries, total, page, pageSize, },);
        },
        {
          query: PaginationQuery,
          response: {
            200: AdminPaginatedEnvelope(AdminAuditRow,),
            403: ErrorResponse,
          },
        },
      )
      .get(`${prefix}/admin/audit/:id`, async (ctx: any,) => {
        const { params: p, userRole, } = ctx;
        if (!can(userRole, "admin.system",)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }
        const { id, } = p as { id: string };
        const entry = await opts.database
          .selectFrom("log_entries",)
          .select([
            "id",
            "level",
            "message",
            "module",
            "event_type",
            "entity_type",
            "entity_id",
            "user_id",
            "session_id",
            "request_id",
            "meta",
            "action",
            "timestamp",
            "time",
            "created_at",
          ],)
          .where("id", "=", id,)
          .executeTakeFirst();
        if (!entry) {
          return jsonError({
            message: ctx.t?.("admin.logEntryNotFound",) ?? "Log entry not found",
            status: HttpStatus.NotFound,
            code: ErrorCode.NotFound,
          },);
        }
        return jsonResponse(entry,);
      }, {
        response: {
          200: t.Any(),
          403: ErrorResponse,
          404: ErrorResponse,
        },
      },)
  );
}
