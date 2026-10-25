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
import { TEMPLATE_MODALITIES, UserRole, } from "../../db/enums";
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
import type { TranslatorFn, } from "../../i18n/types";
import { notFound, } from "../../validation/middleware";
import {
  ErrorResponse,
  SuccessResponse,
  TemplateCreateBody,
  TemplateSummaryResponse,
  TemplateUpdateBody,
} from "../../validation/schemas";
import { extractAuth, HttpStatus, jsonError, jsonResponse, requireUserId, unauthorizedResponse, } from "../http-utils";

const MODALITIES = TEMPLATE_MODALITIES;

const IdParams = Type.Object({ id: Type.String(), },);
const ListQuery = Type.Object({ modality: Type.Optional(Type.String(),), },);

/**
 * The guest-open read gate the list/retrieve routes share: an authenticated
 * caller passes, as does the synthetic guest tier (no account, role
 * `guest`) — everyone else (anonymous without the tier, e.g. the derive
 * denied the request) keeps the canonical 401 `requireUserId` returned
 * before the tier existed.
 * @param ctx - Elysia request context
 * @returns error Response when the caller may not read, null when OK
 */
function requireGuestReadable(ctx: unknown,): Response | null {
  const { userId, userRole, } = extractAuth(ctx,);
  // Truthy id check (not `!== null`): extractAuth casts, and a context that
  // never went through the auth derive carries `undefined` — the same
  // convention as `requireUserId`'s `if (!userId)` and the actor list.
  if (userId || userRole === UserRole.Guest) { return null; }
  return unauthorizedResponse(undefined, (ctx as { t?: TranslatorFn }).t,);
}

/**
 * @param root0 - Handler options
 * @param root0.database - Kysely database handle
 * @param prefix - Route prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { templates: { get: { ...; }; }; }; } & { ...; } & { ...; } & { ...; } & { ...; }, { ...; }, { ...; }>}
 */
export function templateCrudRoutes(
  { database, }: { database: Kysely<DB> },
  prefix = "/api",
) {
  return new Elysia({ name: "template-crud", },)
    .get(`${prefix}/templates`, async (ctx,) => {
      // Guest-open read: the synthetic guest tier lists the built-in presets
      // (it owns no rows); anonymous callers without the tier keep the 401.
      const denied = requireGuestReadable(ctx,);
      if (denied) { return denied; }
      const requested = ctx.query.modality as TemplateModality | undefined;
      const modality = requested && MODALITIES.includes(requested,) ? requested : undefined;
      const templates = await listTemplates(database, extractAuth(ctx,).userId, modality,);
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
      // Guest-open read: the guest tier resolves built-in presets; owner
      // rows stay behind the account (resolveTemplateDef returns null).
      const denied = requireGuestReadable(ctx,);
      if (denied) { return denied; }
      const def = await resolveTemplateDef(database, ctx.params.id, extractAuth(ctx,).userId,);
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
