// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Template pack import/export (FEAT-065) — shareable JSON template packs.
 *
 *   GET  /api/templates/export — download the user's templates as a pack
 *   POST /api/templates/import — create templates from a pack (owner = caller)
 */
import { Type, } from "@sinclair/typebox";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { TemplateModality, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTemplate, type CreateTemplateInput, } from "../../generation/template-service";
import {
  ErrorResponse,
  TemplateImportBody,
  type TemplateImportBodyT,
  TemplateImportResponse,
} from "../../validation/schemas";
import { jsonResponse, requireUserId, } from "../http-utils";

const MODALITIES: readonly TemplateModality[] = ["llm", "image", "video", "audio",];

const ExportQuery = Type.Object({ modality: Type.Optional(Type.String(),), },);

/** Exported pack envelope. */
interface TemplatePack {
  version: 1;
  exportedBy: string;
  templates: CreateTemplateInput[];
}

/**
 * Parse a stored payload JSON string, falling back to an empty object.
 * @param raw - JSON text from the payload column
 */
function safeParse(raw: string,): unknown {
  try {
    return JSON.parse(raw,);
  } catch {
    return {};
  }
}

/**
 * @param root0 - Handler options
 * @param root0.database - Kysely database handle
 * @param prefix - Route prefix
 */
export function templateTransferRoutes(
  { database, }: { database: Kysely<DB> },
  prefix = "/api",
) {
  return new Elysia({ name: "template-transfer", },)
    .get(`${prefix}/templates/export`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const requested = ctx.query.modality as TemplateModality | undefined;
      const modality = requested && MODALITIES.includes(requested,) ? requested : undefined;
      const rows = await database
        .selectFrom("prompt_templates",)
        .selectAll()
        .where("owner_id", "=", userId,)
        .orderBy("name", "asc",)
        .execute();
      const templates = rows
        .filter((row,) => !modality || row.modality === modality)
        .map((row,) => ({
          modality: row.modality,
          name: row.name,
          description: row.description,
          model_family: row.model_family,
          detail_level: row.detail_level,
          payload: safeParse(row.payload,),
        }));
      const pack: TemplatePack = { version: 1, exportedBy: userId, templates, };
      return jsonResponse(pack,);
    }, {
      query: ExportQuery,
      detail: { summary: "Export prompt templates as a JSON pack", tags: ["Templates",], },
    },)
    .post(`${prefix}/templates/import`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      // Elysia cannot statically infer bodies through Type.Unknown payload
      // schemas — assert the validated shape once at the boundary.
      const body = ctx.body as TemplateImportBodyT;
      let imported = 0;
      let skipped = 0;
      for (const input of body.templates) {
        try {
          await createTemplate(database, userId, input,);
          imported += 1;
        } catch {
          skipped += 1;
        }
      }
      return jsonResponse({ imported, skipped, },);
    }, {
      body: TemplateImportBody,
      response: { 200: TemplateImportResponse, 401: ErrorResponse, },
      detail: { summary: "Import prompt templates from a JSON pack", tags: ["Templates",], },
    },);
}
