// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unified prompt-template CRUD routes (FEAT-065).
 *
 *   GET    /api/templates            — list user templates + LLM presets
 *   POST   /api/templates            — create
 *   GET    /api/templates/:id        — retrieve (row or preset)
 *   PATCH  /api/templates/:id        — update (owner only)
 *   DELETE /api/templates/:id        — delete (owner only)
 */
import { Type, } from "@sinclair/typebox";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { TemplateModality, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { CreateTemplateInput, } from "../../generation/template-service";
import {
  createTemplate,
  deleteTemplate,
  getOwnedTemplate,
  listTemplates,
  resolveTemplateDef,
  serializeTemplateInput,
  updateTemplate,
} from "../../generation/template-service";
import { parseTemplatePayload, } from "../../generation/template-types";
import { notFound, } from "../../validation/middleware";
import {
  ErrorResponse,
  SuccessResponse,
  TemplateCreateBody,
  TemplateSummaryResponse,
  TemplateUpdateBody,
} from "../../validation/schemas";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";


const MODALITIES: readonly TemplateModality[] = ["llm", "image", "video", "audio",];

const IdParams = Type.Object({ id: Type.String(), },);
const ListQuery = Type.Object({ modality: Type.Optional(Type.String(),), },);

/**
 * @param root0 - Handler options
 * @param root0.database - Kysely database handle
 * @param prefix - Route prefix
 */
export function templateCrudRoutes(
  { database, }: { database: Kysely<DB> },
  prefix = "/api",
) {
  return new Elysia({ name: "template-crud", },)
    .get(`${prefix}/templates`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const requested = ctx.query.modality as TemplateModality | undefined;
      const modality = requested && MODALITIES.includes(requested,) ? requested : undefined;
      const templates = await listTemplates(database, userId, modality,);
      return jsonResponse({ templates, },);
    }, {
      query: ListQuery,
      response: { 200: TemplateSummaryResponse, 401: ErrorResponse, },
      detail: { summary: "List prompt templates", tags: ["Templates",], },
    },)
    .post(`${prefix}/templates`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const input = ctx.body as CreateTemplateInput;
      const serialized = serializeTemplateInput(input,);
      if (!serialized.ok) {
        return jsonError({ message: serialized.error, status: HttpStatus.BadRequest, },);
      }
      const row = await createTemplate(database, userId, input,);
      return jsonResponse({ template: row, },);
    }, {
      body: TemplateCreateBody,
      response: { 200: SuccessResponse, 401: ErrorResponse, },
      detail: { summary: "Create a prompt template", tags: ["Templates",], },
    },)
    .get(`${prefix}/templates/:id`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const def = await resolveTemplateDef(database, ctx.params.id, userId,);
      if (def?.preset) {
        return jsonResponse({
          template: {
            id: def.preset.id,
            modality: "llm",
            name: def.preset.name,
            description: def.preset.description,
            detail_level: def.preset.detail_level,
            isPreset: true,
            payload: { sections: def.preset.sections, },
          },
        },);
      }
      if (def?.row) {
        return jsonResponse({
          template: {
            ...def.row,
            payload: parseTemplatePayload(def.row.payload, def.row.modality,),
            isPreset: false,
          },
        },);
      }
      return notFound("Template not found",);
    }, {
      params: IdParams,
      response: { 401: ErrorResponse, 404: ErrorResponse, },
      detail: { summary: "Retrieve a prompt template", tags: ["Templates",], },
    },)
    .patch(`${prefix}/templates/:id`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const row = await updateTemplate(database, ctx.params.id, userId, ctx.body,);
        if (!row) { return notFound("Template not found",); }
        return jsonResponse({
          template: { ...row, payload: parseTemplatePayload(row.payload, row.modality,), },
        },);
      } catch (error) {
        return jsonError({
          message: error instanceof Error ? error.message : "Invalid template update",
          status: HttpStatus.BadRequest,
        },);
      }
    }, {
      params: IdParams,
      body: TemplateUpdateBody,
      response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: { summary: "Update a prompt template", tags: ["Templates",], },
    },)
    .delete(`${prefix}/templates/:id`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const existing = await getOwnedTemplate(database, ctx.params.id, userId,);
      if (!existing) { return notFound("Template not found",); }
      await deleteTemplate(database, ctx.params.id, userId,);
      return new Response(null, { status: 204, },);
    }, {
      params: IdParams,
      response: { 401: ErrorResponse, 404: ErrorResponse, },
      detail: { summary: "Delete a prompt template", tags: ["Templates",], },
    },);
}
