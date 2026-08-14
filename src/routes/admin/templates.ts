import { Elysia, t, } from "elysia";
import { isAdminRole, } from "../../middleware/admin-gate";
import { jsonParseOr, jsonStringifyOr, } from "../../utils";
import { AdminTemplateCreateBody, AdminTemplateUpdateBody, ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonNoContent, jsonResponse, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

export function templatesRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "admin-templates", },)
      // ── Template management ─────────────────────────────────
      .get(`${prefix}/admin/templates`, async (ctx: any,) => {
        const { userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }
        const row = await opts.database
          .selectFrom("system_config",)
          .select("value",)
          .where("key", "=", "sd.templates",)
          .executeTakeFirst();
        const profiles = row ? jsonParseOr(row.value, {},) : {};
        return jsonResponse(profiles,);
      }, {
        response: {
          200: t.Any(),
          403: ErrorResponse,
        },
      },)
      .put(
        `${prefix}/admin/templates/:id`,
        async (ctx: any,) => {
          const { params: p, userRole, body, } = ctx;
          if (!isAdminRole(userRole,)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }
          const { id, } = p as { id: string };
          const update = body as Record<string, unknown>;
          const row = await opts.database
            .selectFrom("system_config",)
            .select("value",)
            .where("key", "=", "sd.templates",)
            .executeTakeFirst();
          const profiles: Record<string, unknown> = row ? jsonParseOr(row.value, {},) : {};
          if (!profiles[id]) {
            return jsonError({
              message: ctx.t?.("admin.templateNotFound",) ?? "Template not found",
              status: HttpStatus.NotFound,
              code: ErrorCode.NotFound,
            },);
          }
          profiles[id] = { ...profiles[id], ...update, id, };
          await opts.database
            .insertInto("system_config",)
            .values({
              key: "sd.templates",
              value: jsonStringifyOr(profiles,),
              description: "SD image model prompt templates",
            },)
            .onConflict((oc,) =>
              oc.column("key",).doUpdateSet({
                value: jsonStringifyOr(profiles,),
                updated_at: new Date().toISOString(),
              },)
            )
            .execute();
          return jsonResponse(profiles[id],);
        },
        { body: AdminTemplateUpdateBody, response: { 200: t.Any(), 403: ErrorResponse, 404: ErrorResponse, }, },
      )
      .post(
        `${prefix}/admin/templates`,
        async (ctx: any,) => {
          const { userRole, body, } = ctx;
          if (!isAdminRole(userRole,)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }
          const profile = body as Record<string, unknown>;
          const id = profile.id as string;
          const row = await opts.database
            .selectFrom("system_config",)
            .select("value",)
            .where("key", "=", "sd.templates",)
            .executeTakeFirst();
          const profiles: Record<string, unknown> = row ? jsonParseOr(row.value, {},) : {};
          if (profiles[id]) {
            return jsonError({
              message: ctx.t?.("admin.templateAlreadyExists",) ?? "Template already exists",
              status: HttpStatus.BadRequest,
              code: ErrorCode.BadRequest,
            },);
          }
          profiles[id] = profile;
          await opts.database
            .insertInto("system_config",)
            .values({
              key: "sd.templates",
              value: jsonStringifyOr(profiles,),
              description: "SD image model prompt templates",
            },)
            .onConflict((oc,) =>
              oc.column("key",).doUpdateSet({
                value: jsonStringifyOr(profiles,),
                updated_at: new Date().toISOString(),
              },)
            )
            .execute();
          return jsonResponse(profile,);
        },
        { body: AdminTemplateCreateBody, response: { 200: t.Any(), 400: ErrorResponse, 403: ErrorResponse, }, },
      )
      .delete(`${prefix}/admin/templates/:id`, async (ctx: any,) => {
        const { params: p, userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }
        const { id, } = p as { id: string };
        const row = await opts.database
          .selectFrom("system_config",)
          .select("value",)
          .where("key", "=", "sd.templates",)
          .executeTakeFirst();
        const profiles: Record<string, unknown> = row ? jsonParseOr(row.value, {},) : {};
        if (!profiles[id]) {
          return jsonError({
            message: ctx.t?.("admin.templateNotFound",) ?? "Template not found",
            status: HttpStatus.NotFound,
            code: ErrorCode.NotFound,
          },);
        }
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete profiles[id];
        await opts.database
          .insertInto("system_config",)
          .values({
            key: "sd.templates",
            value: jsonStringifyOr(profiles,),
            description: "SD image model prompt templates",
          },)
          .onConflict((oc,) =>
            oc.column("key",).doUpdateSet({ value: jsonStringifyOr(profiles,), updated_at: new Date().toISOString(), },)
          )
          .execute();
        return jsonNoContent();
      }, {
        response: {
          204: t.Void(),
          403: ErrorResponse,
          404: ErrorResponse,
        },
      },)
  );
}
