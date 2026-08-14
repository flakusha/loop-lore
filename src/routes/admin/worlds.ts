import { Elysia, t, } from "elysia";
import { isAdminRole, } from "../../middleware/admin-gate";
import { ErrorResponse, PaginationQuery, WorldIdParams, } from "../../validation/schemas";
import { AdminPaginatedEnvelope, AdminWorldRow, } from "../../validation/schemas/responses";
import { ErrorCode, HttpStatus, jsonError, jsonNoContent, jsonResponse, parsePagination, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

export function worldsRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-worlds", },)
      // ── World management ───────────────────────────────────
      .get(
        `${prefix}/admin/worlds`,
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

          let countQuery = opts.database
            .selectFrom("worlds",)
            .select(opts.database.fn.countAll<number>().as("total",),);
          let listQuery = opts.database
            .selectFrom("worlds",)
            .select(["id", "name", "description", "owner_id", "created_at", "updated_at",],)
            .orderBy("created_at", "desc",)
            .limit(pageSize,)
            .offset(offset,);

          if (q) {
            const like = `%${q}%`;
            countQuery = countQuery.where("name", "like", like,);
            listQuery = listQuery.where("name", "like", like,);
          }

          const countResult = await countQuery.executeTakeFirst();
          const total = countResult?.total ?? 0;
          const worlds = await listQuery.execute();

          return jsonResponse({ data: worlds, total, page, pageSize, },);
        },
        {
          query: PaginationQuery,
          response: {
            200: AdminPaginatedEnvelope(AdminWorldRow,),
            403: ErrorResponse,
          },
        },
      )
      .get(
        `${prefix}/admin/worlds/:id`,
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
          const world = await opts.database
            .selectFrom("worlds",)
            .selectAll()
            .where("id", "=", id,)
            .executeTakeFirst();
          if (!world) {
            return jsonError({
              message: ctx.t?.("admin.worldNotFound",) ?? "World not found",
              status: HttpStatus.NotFound,
              code: ErrorCode.NotFound,
            },);
          }

          const locationCount = await opts.database
            .selectFrom("locations",)
            .select(opts.database.fn.countAll<number>().as("n",),)
            .where("world_id", "=", id,)
            .executeTakeFirst();

          return jsonResponse({
            ...world,
            locationCount: locationCount?.n ?? 0,
          },);
        },
        { params: WorldIdParams, response: { 200: t.Any(), 403: ErrorResponse, 404: ErrorResponse, }, },
      )
      .delete(
        `${prefix}/admin/worlds/:id`,
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
          await opts.database.deleteFrom("worlds",).where("id", "=", id,).execute();
          return jsonNoContent();
        },
        { params: WorldIdParams, response: { 204: t.Void(), 403: ErrorResponse, }, },
      )
  );
}
