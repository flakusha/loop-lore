import { Elysia, t, } from "elysia";
import { isAdminRole, } from "../../middleware/admin-gate";
import {
  AdminRoleUpdateBody,
  ErrorResponse,
  PaginationQuery,
  SuccessResponse,
  UserIdParams,
} from "../../validation/schemas";
import { AdminPaginatedEnvelope, AdminUserRow, } from "../../validation/schemas/responses";
import { ErrorCode, HttpStatus, jsonError, jsonNoContent, jsonResponse, parsePagination, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

export function usersRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  const db = opts.database;

  return (
    new Elysia({ name: "admin-users", },)
      // ── User management ────────────────────────────────────
      .get(
        `${prefix}/admin/users`,
        async (ctx: any,) => {
          const { userRole, } = ctx;
          if (!isAdminRole(userRole,)) {
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
          const roleFilter = url.searchParams.get("role",);
          const statusFilter = url.searchParams.get("status",);

          let countQuery = db.selectFrom("users",).select(db.fn.countAll<number>().as("total",),);
          let listQuery = db
            .selectFrom("users",)
            .select(["id", "username", "display_name", "role", "status", "created_at", "last_seen_at",],)
            .orderBy("created_at", "desc",)
            .limit(pageSize,)
            .offset(offset,);

          if (q) {
            const like = `%${q}%`;
            countQuery = countQuery.where((eb,) =>
              eb.or([eb("username", "like", like,), eb("display_name", "like", like,),],)
            );
            listQuery = listQuery.where((eb,) =>
              eb.or([eb("username", "like", like,), eb("display_name", "like", like,),],)
            );
          }
          if (roleFilter) {
            countQuery = countQuery.where("role", "=", roleFilter as any,);
            listQuery = listQuery.where("role", "=", roleFilter as any,);
          }
          if (statusFilter) {
            countQuery = countQuery.where("status", "=", statusFilter as any,);
            listQuery = listQuery.where("status", "=", statusFilter as any,);
          }

          const countResult = await countQuery.executeTakeFirst();
          const total = countResult?.total ?? 0;
          const users = await listQuery.execute();

          return jsonResponse({ data: users, total, page, pageSize, },);
        },
        {
          query: PaginationQuery,
          response: {
            200: AdminPaginatedEnvelope(AdminUserRow,),
            403: ErrorResponse,
          },
          detail: {
            summary: "List users",
            description: "List all users with search, role, and status filtering. Admin only.",
            tags: ["Admin",],
          },
        },
      )
      .get(
        `${prefix}/admin/users/:id`,
        async (ctx: any,) => {
          const { params: p, userRole, } = ctx;
          if (!isAdminRole(userRole,)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }

          const { id, } = p as { id: string };
          const user = await db
            .selectFrom("users",)
            .select([
              "id",
              "username",
              "display_name",
              "role",
              "status",
              "birth_date",
              "settings",
              "created_at",
              "last_seen_at",
            ],)
            .where("id", "=", id,)
            .executeTakeFirst();

          if (!user) {
            return jsonError({
              message: ctx.t?.("admin.userNotFound",) ?? "User not found",
              status: HttpStatus.NotFound,
              code: ErrorCode.NotFound,
            },);
          }
          return jsonResponse(user,);
        },
        {
          params: UserIdParams,
          response: {
            200: t.Any(),
            403: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Get user",
            description: "Get a user's full profile including settings and birth date. Admin only.",
            tags: ["Admin",],
          },
        },
      )
      .patch(
        `${prefix}/admin/users/:id/role`,
        async (ctx: any,) => {
          const { params: p, body, userRole, } = ctx;
          if (!isAdminRole(userRole,)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }

          const { id, } = p as { id: string };
          const { role, } = body as { role: "admin" | "user" | "viewer" };

          await db.updateTable("users",).set({ role, },).where("id", "=", id,).execute();
          return jsonResponse({ ok: true, },);
        },
        {
          body: AdminRoleUpdateBody,
          params: UserIdParams,
          response: { 200: SuccessResponse, 403: ErrorResponse, 404: ErrorResponse, },
        },
      )
      .delete(
        `${prefix}/admin/users/:id`,
        async (ctx: any,) => {
          const { params: p, userRole, } = ctx;
          if (!isAdminRole(userRole,)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }

          const { id, } = p as { id: string };
          await db.deleteFrom("users",).where("id", "=", id,).execute();
          return jsonNoContent();
        },
        { params: UserIdParams, response: { 204: t.Void(), 403: ErrorResponse, }, },
      )
  );
}
