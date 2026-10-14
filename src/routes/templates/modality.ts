// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-modality prompt-template routes (FEAT-065 SUB-VIDEO / SUB-AUDIO).
 *
 * Thin facades over the unified template service, mounted per modality:
 *
 *   GET    /api/templates/video|audio           — list (owner rows)
 *   POST   /api/templates/video|audio           — create (modality forced)
 *   GET    /api/templates/video|audio/:id       — retrieve (owner + modality)
 *   PATCH  /api/templates/video|audio/:id       — update (owner + modality)
 *   DELETE /api/templates/video|audio/:id       — delete (owner + modality)
 *   POST   /api/templates/video|audio/:id/apply — audio generates, video 501
 *
 * Render previews stay on the unified `POST /api/templates/:id/apply`
 * (prompt-only, provider-independent). The per-modality apply is the
 * generation entrypoint: audio templates dispatch to the ambient audio
 * pipeline (TASK-ambient-sound-system); video still answers 501 while no
 * video provider exists, per the ticket contract.
 */
import { Type, } from "@sinclair/typebox";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { TemplateModality, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { handleAmbientGeneration, } from "../../generation/audio-gen-route";
import {
  createTemplate,
  type CreateTemplateInput,
  deleteTemplate,
  getOwnedTemplate,
  listTemplates,
  serializeTemplateInput,
  updateTemplate,
} from "../../generation/template-service";
import { parseTemplatePayload, } from "../../generation/template-types";
import { notFound, } from "../../validation/middleware";
import {
  ErrorResponse,
  SuccessResponse,
  TemplateApplyBody,
  TemplateDetailLevelSchema,
  TemplateSummaryResponse,
} from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";

/** Scene tags accepted per audio apply — matches the ambient route cap. */
const MAX_AUDIO_TAGS = 8;

/**
 * Create/update bodies: unified fields with an OPTIONAL `modality`. The
 * path pins the modality; the handler rejects a body `modality` that
 * disagrees with it. Declared explicitly (rather than `Omit`) so the
 * optional key survives Elysia's body cleaning.
 */
const ModalityCreateBody = Type.Object({
  modality: Type.Optional(Type.String(),),
  name: Type.String({ minLength: 1, maxLength: 200, },),
  description: Type.Optional(Type.Union([Type.String(), Type.Null(),],),),
  model_family: Type.Optional(Type.Union([Type.String(), Type.Null(),],),),
  detail_level: Type.Optional(TemplateDetailLevelSchema,),
  payload: Type.Unknown(),
},);

const ModalityUpdateBody = Type.Partial(ModalityCreateBody,);
const IdParams = Type.Object({ id: Type.String(), },);

/**
 * Build the CRUD + apply surface for one simple modality (video | audio).
 *
 * Bodies extend the unified fields with an OPTIONAL `modality` (declared
 * explicitly so it survives Elysia's body cleaning); the handler rejects
 * a body that disagrees with the path.
 *
 * @param modality - Modality pinned by the route path
 * @param root0 - Handler options
 * @param root0.database - Kysely database handle
 * @param prefix - Route prefix
 * @returns the mounted CRUD + apply plugin for this modality
 */
export function modalityTemplateRoutes(
  modality: Extract<TemplateModality, "video" | "audio">,
  { database, }: { database: Kysely<DB> },
  prefix = "/api",
) {
  const base = `${prefix}/templates/${modality}`;

  /**
   * 404 unless the template exists, is owned, and matches the route modality.
   * @param id
   * @param userId
   */
  const ownedMatchingRow = async (id: string, userId: string,) => {
    const row = await getOwnedTemplate(database, id, userId,);
    if (!row || row.modality !== modality) { return null; }
    return row;
  };

  /**
   * Audio apply: render the template body with the request context and split
   * it into scene tags for the ambient pipeline.
   * @param body - Template body to render
   * @param vars - {{variable}} substitutions from the apply context
   */
  const renderAudioTags = (body: string, vars: Record<string, string>,): string[] =>
    body
      .replace(/\{\{(\w+)\}\}/g, (_match, name: string,) => vars[name] ?? "",)
      .split(",",)
      .map((tag,) => tag.trim())
      .filter((tag,) => tag.length > 0)
      .slice(0, MAX_AUDIO_TAGS,);

  return new Elysia({ name: `template-modality-${modality}`, },)
    .get(base, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const templates = await listTemplates(database, userId, modality,);
      return jsonResponse({ templates, },);
    }, {
      response: { 200: TemplateSummaryResponse, 401: ErrorResponse, },
      detail: { summary: `List ${modality} templates`, tags: ["Templates",], },
    },)
    .post(base, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const body = ctx.body as Partial<CreateTemplateInput> & { modality?: string };
      if (body.modality !== undefined && body.modality !== modality) {
        return jsonError({
          message: `Body modality must be "${modality}" or omitted`,
          status: HttpStatus.BadRequest,
        },);
      }

      const input = { ...body, modality, } as CreateTemplateInput;
      const serialized = serializeTemplateInput(input,);
      if (!serialized.ok) {
        return jsonError({ message: serialized.error, status: HttpStatus.BadRequest, },);
      }

      const row = await createTemplate(database, userId, input,);
      return jsonResponse({ template: row, },);
    }, {
      body: ModalityCreateBody,
      response: { 200: SuccessResponse, 401: ErrorResponse, },
      detail: { summary: `Create a ${modality} template`, tags: ["Templates",], },
    },)
    .get(`${base}/:id`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const row = await ownedMatchingRow(ctx.params.id, userId,);
      if (!row) { return notFound("Template not found",); }
      return jsonResponse({
        template: { ...row, payload: parseTemplatePayload(row.payload, row.modality,), isPreset: false, },
      },);
    }, {
      params: IdParams,
      response: { 401: ErrorResponse, 404: ErrorResponse, },
      detail: { summary: `Retrieve a ${modality} template`, tags: ["Templates",], },
    },)
    .patch(`${base}/:id`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const patch = ctx.body as Partial<CreateTemplateInput>;
      if (patch.modality !== undefined && patch.modality !== modality) {
        return jsonError({
          message: `Templates cannot move between modalities via this route`,
          status: HttpStatus.BadRequest,
        },);
      }

      // Pre-check before any write: a wrong-modality (or foreign) id must
      // 404 without mutating the row. Kept OUTSIDE the try so a DB read
      // failure propagates to the 500 boundary instead of being misclassified
      // as a client 400.
      const existing = await ownedMatchingRow(ctx.params.id, userId,);
      if (!existing) { return notFound("Template not found",); }
      try {
        const row = await updateTemplate(database, ctx.params.id, userId, patch,);
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
      body: ModalityUpdateBody,
      response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: { summary: `Update a ${modality} template`, tags: ["Templates",], },
    },)
    .delete(`${base}/:id`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const row = await ownedMatchingRow(ctx.params.id, userId,);
      if (!row) { return notFound("Template not found",); }
      await deleteTemplate(database, ctx.params.id, userId,);
      return new Response(null, { status: 204, },);
    }, {
      params: IdParams,
      response: { 401: ErrorResponse, 404: ErrorResponse, },
      detail: { summary: `Delete a ${modality} template`, tags: ["Templates",], },
    },)
    .post(`${base}/:id/apply`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const row = await ownedMatchingRow(ctx.params.id, userId,);
      if (!row) { return notFound("Template not found",); }

      if (modality === "audio") {
        const body = ctx.body as { context?: Record<string, string>; chatId?: string };
        const payload = parseTemplatePayload(row.payload, "audio",) as { body?: string };
        const tags = renderAudioTags(payload.body ?? "", body.context ?? {},);
        if (tags.length === 0) {
          return jsonError({
            message: "audio template body rendered no scene tags (render previews via POST /api/templates/:id/apply)",
            status: HttpStatus.BadRequest,
          },);
        }

        // Auth, IDOR scoping, generation and asset persistence live in the
        // ambient route handler; this seam only renders + routes.
        const userRole = (ctx as { userRole?: string | null }).userRole ?? undefined;
        return handleAmbientGeneration({ tags, chatId: body.chatId, }, database, userId, userRole,);
      }

      // Generation entrypoint: no video provider exists yet (ticket contract).
      // Prompt-only rendering stays on the unified apply route.
      return jsonError({
        message:
          "video generation providers are not implemented yet — render previews via POST /api/templates/:id/apply",
        status: HttpStatus.NotImplemented,
        code: ErrorCode.NotImplemented,
      },);
    }, {
      params: IdParams,
      body: TemplateApplyBody,
      response: {
        200: SuccessResponse,
        400: ErrorResponse,
        401: ErrorResponse,
        404: ErrorResponse,
        501: ErrorResponse,
      },
      detail: {
        summary: modality === "audio"
          ? `Apply an audio template (generate)`
          : `Apply a video template (not yet implemented)`,
        tags: ["Templates",],
      },
    },);
}
