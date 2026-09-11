// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { requirePermission, } from "../../middleware/permissions";
import { jsonParseOr, jsonStringifyOr, } from "../../utils";
import { AdminTemplateCreateBody, AdminTemplateUpdateBody, ErrorResponse, } from "../../validation/schemas";
import {
  ErrorCode,
  extractAuth,
  HttpStatus,
  jsonError,
  jsonNoContent,
  jsonResponse,
  requireUserId,
} from "../http-utils";
import type { AdminRouteOpts, } from "./types";

// SD image-model prompt templates. Mounted under /api/admin/sd-templates to
// avoid collision with the prompt-template-profiles module at
// /api/admin/templates (src/routes/admin-templates/).
/**
 * @param opts
 * @param prefix
 */
export function sdTemplatesRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  const guard = requirePermission("admin.settings",);
  return (
    new Elysia({ name: "admin-sd-templates", },)
      // ── SD template management (gated by admin.settings) ───────
      .guard({ beforeHandle: guard, }, (app,) =>
        app
          .get(`${prefix}/admin/sd-templates`, async (ctx: any,) => {
            const userId = requireUserId(ctx,);
            if (typeof userId !== "string") { return userId; }
            extractAuth(ctx,);
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
            `${prefix}/admin/sd-templates/:id`,
            async (ctx: any,) => {
              const userId = requireUserId(ctx,);
              if (typeof userId !== "string") { return userId; }
              extractAuth(ctx,);
              const { id, } = ctx.params as { id: string };
              const update = ctx.body as Record<string, unknown>;
              const row = await opts.database
                .selectFrom("system_config",)
                .select("value",)
                .where("key", "=", "sd.templates",)
                .executeTakeFirst();
              const profiles: Record<string, unknown> = row ? jsonParseOr(row.value, {},) : {};
              if (!profiles[id]) {
                return jsonError({
                  message: "Template not found",
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
            `${prefix}/admin/sd-templates`,
            async (ctx: any,) => {
              const userId = requireUserId(ctx,);
              if (typeof userId !== "string") { return userId; }
              extractAuth(ctx,);
              const profile = ctx.body as Record<string, unknown>;
              const id = profile.id as string;
              const row = await opts.database
                .selectFrom("system_config",)
                .select("value",)
                .where("key", "=", "sd.templates",)
                .executeTakeFirst();
              const profiles: Record<string, unknown> = row ? jsonParseOr(row.value, {},) : {};
              if (profiles[id]) {
                return jsonError({
                  message: "Template already exists",
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
          .delete(`${prefix}/admin/sd-templates/:id`, async (ctx: any,) => {
            const userId = requireUserId(ctx,);
            if (typeof userId !== "string") { return userId; }
            extractAuth(ctx,);
            const { id, } = ctx.params as { id: string };
            const row = await opts.database
              .selectFrom("system_config",)
              .select("value",)
              .where("key", "=", "sd.templates",)
              .executeTakeFirst();
            const profiles: Record<string, unknown> = row ? jsonParseOr(row.value, {},) : {};
            if (!profiles[id]) {
              return jsonError({
                message: "Template not found",
                status: HttpStatus.NotFound,
                code: ErrorCode.NotFound,
              },);
            }

            delete profiles[id];
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
            return jsonNoContent();
          }, {
            response: {
              204: t.Void(),
              403: ErrorResponse,
              404: ErrorResponse,
            },
          },),)
  );
}
