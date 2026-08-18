// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import {
  createChatSetupTemplate,
  deleteChatSetupTemplate,
  listChatSetupTemplates,
  updateChatSetupTemplate,
} from "../../chat/service";
import { can, } from "../../users/permissions";
import { jsonParseOr, } from "../../utils";
import {
  ChatSetupTemplateCreateBody,
  ChatSetupTemplateSchema,
  ChatSetupTemplateUpdateBody,
  ErrorResponse,
} from "../../validation/schemas";
import {
  forbiddenResponse as forbidden,
  HttpStatus,
  jsonCreated,
  jsonError,
  jsonNoContent,
  jsonResponse,
  notFoundResponse as notFound,
  requireUserId,
} from "../http-utils";
import type { HandlerOpts, } from "./types";

export function templatesRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chats-templates", },)
      .get(
        `${prefix}/chat-setup-templates`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const templates = await listChatSetupTemplates(database,);
          const payload = Array.from(templates, (tmpl,) => ({
            id: tmpl.id,
            slug: tmpl.slug,
            name: tmpl.name,
            description: tmpl.description,
            mode: tmpl.mode,
            turnStrategy: tmpl.turn_strategy,
            worldId: tmpl.world_id,
            gmConfig: tmpl.gm_config ? jsonParseOr(tmpl.gm_config, {},) : null,
            visualNovel: tmpl.visual_novel === 1,
            features: tmpl.features ?? [],
            visibility: tmpl.visibility ?? null,
          }),);
          return jsonResponse(payload,);
        },
        { response: { 200: t.Array(ChatSetupTemplateSchema,), }, },
      )
      .post(
        `${prefix}/chat-setup-templates`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          if (!can(ctx.userRole, "admin.settings",)) {
            return forbidden(ctx.t?.("errors.forbidden",) ?? "Forbidden",);
          }
          const body = ctx.body as typeof ChatSetupTemplateCreateBody.static;
          const result = await createChatSetupTemplate(database, {
            slug: body.slug,
            name: body.name,
            description: body.description ?? null,
            mode: body.mode ?? null,
            turnStrategy: body.turnStrategy ?? null,
            worldId: body.worldId ?? null,
            gmConfig: body.gmConfig ?? null,
            visualNovel: body.visualNovel ?? false,
            features: body.features ?? null,
            visibility: body.visibility ?? null,
          },);
          if (!result.ok) {
            if (result.code === "conflict") {
              return jsonError({ message: result.message, status: HttpStatus.Conflict, },);
            }
            return jsonError({ message: result.message, status: HttpStatus.BadRequest, },);
          }
          return jsonCreated(result.template,);
        },
        {
          body: ChatSetupTemplateCreateBody,
          response: { 201: ChatSetupTemplateSchema, 401: ErrorResponse, 403: ErrorResponse, 409: ErrorResponse, },
        },
      )
      .put(
        `${prefix}/chat-setup-templates/:templateId`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          if (!can(ctx.userRole, "admin.settings",)) {
            return forbidden(ctx.t?.("errors.forbidden",) ?? "Forbidden",);
          }
          const body = ctx.body as typeof ChatSetupTemplateUpdateBody.static | undefined;
          const result = await updateChatSetupTemplate(database, ctx.params.templateId, {
            name: body?.name,
            description: body?.description,
            mode: body?.mode,
            turnStrategy: body?.turnStrategy,
            worldId: body?.worldId,
            gmConfig: body?.gmConfig,
            visualNovel: body?.visualNovel,
            features: body?.features,
            visibility: body?.visibility,
          },);
          if (!result.ok) {
            if (result.code === "not_found") { return notFound("Template not found",); }
            return jsonError({ message: result.message, status: HttpStatus.BadRequest, },);
          }
          return jsonResponse(result.template,);
        },
        {
          params: t.Object({ templateId: t.String(), },),
          body: ChatSetupTemplateUpdateBody,
          response: { 200: ChatSetupTemplateSchema, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
        },
      )
      .delete(
        `${prefix}/chat-setup-templates/:templateId`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          if (!can(ctx.userRole, "admin.settings",)) {
            return forbidden(ctx.t?.("errors.forbidden",) ?? "Forbidden",);
          }
          const result = await deleteChatSetupTemplate(database, ctx.params.templateId,);
          if (!result.ok) {
            if (result.code === "not_found") { return notFound("Template not found",); }
            return jsonError({ message: result.message, status: HttpStatus.BadRequest, },);
          }
          return jsonNoContent();
        },
        {
          params: t.Object({ templateId: t.String(), },),
          response: { 204: t.Void(), 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
        },
      )
  );
}
