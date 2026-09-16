// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Template apply/render routes (FEAT-065).
 *
 *   POST /api/templates/:id/apply — render a template against context
 *
 * LLM templates render through the PromptAssembler (actor + chat context);
 * image templates render their {{variable}} skeleton; video/audio render
 * their body with variable substitution. Import/export live in transfer.ts.
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { Type, } from "@sinclair/typebox";
import { PromptAssembler, } from "../../assistant/prompt-assembler";
import type { DB, } from "../../db/schema";
import {
  applyImageTemplate,
  applySimpleTemplate,
  resolveTemplateDef,
} from "../../generation/template-service";
import {
  parseTemplatePayload,
  type ImageTemplatePayload,
  type SimpleTemplatePayload,
} from "../../generation/template-types";
import { notFound, } from "../../validation/middleware";
import {
  ErrorResponse,
  TemplateApplyBody,
  type TemplateApplyBodyT,
} from "../../validation/schemas";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";

const ApplyParams = Type.Object({ id: Type.String(), },);

/**
 * @param root0 - Handler options
 * @param root0.database - Kysely database handle
 * @param prefix - Route prefix
 */
export function templateApplyRoutes(
  { database, }: { database: Kysely<DB> },
  prefix = "/api",
) {
  return new Elysia({ name: "template-apply", },)
    .post(`${prefix}/templates/:id/apply`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const { id } = ctx.params;
      // Elysia cannot statically infer bodies through Type.Unknown payload
      // schemas — assert the validated shape once at the boundary.
      const body = ctx.body as TemplateApplyBodyT;

      const def = await resolveTemplateDef(database, id, userId,);
      if (!def) { return notFound("Template not found",); }

      if (def.preset || def.row.modality === "llm") {
        if (!body.actorId || !body.chatId) {
          return jsonError({
            message: "LLM template apply requires actorId and chatId",
            status: HttpStatus.BadRequest,
          },);
        }
        const assembler = new PromptAssembler(database,);
        const assembled = await assembler.assembleWithTemplateOverride(
          {
            actorId: body.actorId,
            chatId: body.chatId,
            modelId: body.modelId ?? "template-preview",
            userId,
          },
          id,
          userId,
        );
        if (!assembled) { return notFound("Template is not an LLM template",); }
        return jsonResponse({
          messages: assembled.messages,
          systemPrompt: assembled.systemPrompt,
          tokenCount: assembled.tokenCount,
          tokenBudget: assembled.tokenBudget,
        },);
      }

      const modality = def.row.modality;
      const payload = parseTemplatePayload(def.row.payload, modality,);
      if (!payload) {
        return jsonError({ message: "Template payload is malformed", status: HttpStatus.BadRequest, },);
      }
      if (modality === "image") {
        return jsonResponse(applyImageTemplate(payload as ImageTemplatePayload, body.context ?? {},),);
      }
      return jsonResponse({ body: applySimpleTemplate(payload as SimpleTemplatePayload, body.context ?? {},), },);
    }, {
      params: ApplyParams,
      body: TemplateApplyBody,
      response: { 401: ErrorResponse, 404: ErrorResponse, },
      detail: { summary: "Render a prompt template", tags: ["Templates",], },
    },);
}
