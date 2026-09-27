// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Update endpoint: edit a workflow's metadata, its graph, or both.
 * @module routes/admin-comfyui-workflows/update
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { serializeTemplateInput, } from "../../generation/template-service/crud";
import {
  invalidateWorkflowRegistry,
  rowToPayload,
  validateWorkflowPayload,
} from "../../generation/workflow-library";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonResponse, requireUserId, } from "../http-utils";
import { buildWorkflowPayload, readMeta, slotsColumn, uploadedGraph, } from "./payload";
import { getWorkflowRow, } from "./rows";
import { log, workflowGuard, workflowInvalid, workflowNotFound, } from "./shared";

/** Open object so a bare graph (node-id keys) passes validation untouched. */
const UpdateBody = t.Object(
  {
    name: t.Optional(t.String(),),
    description: t.Optional(t.String(),),
    model_family: t.Optional(t.String(),),
    min_vram: t.Optional(t.Number(),),
    category: t.Optional(t.String(),),
    parameters: t.Optional(t.Array(t.Unknown(),),),
    requiredNodes: t.Optional(t.Array(t.String(),),),
    loraSlots: t.Optional(t.Array(t.Unknown(),),),
  },
  { additionalProperties: true, },
);

/**
 * @param opts
 * @param opts.database
 * @param prefix
 */
export function updateRoutes(opts: { database: Kysely<DB> }, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "admin-comfyui-workflows-update", },)
      .guard({ beforeHandle: workflowGuard, }, (app,) =>
        app
          // ── Update a workflow row ──────────────────────────────
          .put(
            `${prefix}/admin/comfyui-workflows/:id`,
            async (ctx,) => {
              const userId = requireUserId(ctx,);
              if (typeof userId !== "string") { return userId; }
              const { id, } = ctx.params;
              // Same justification as create: known fields are schema-typed,
              // the pass-through graph keys are narrowed in readMeta.
              const body = ctx.body as Record<string, unknown>;

              const row = await getWorkflowRow(database, id,);
              if (!row) { return workflowNotFound(id,); }
              const current = rowToPayload(row,);
              if (!current) {
                return workflowInvalid(["stored payload is unreadable; re-upload the workflow",],);
              }

              // A request without a graph is a metadata-only edit; the stored
              // graph is carried forward so the ingest gate still sees it.
              const meta = readMeta(body,);
              const graph = uploadedGraph(body,) ?? current.body;
              const validated = validateWorkflowPayload(
                buildWorkflowPayload(graph, {
                  category: meta.category ?? current.category,
                  parameters: meta.parameters ?? current.parameters,
                  requiredNodes: meta.requiredNodes ?? current.requiredNodes,
                  loraSlots: meta.loraSlots ?? current.loraSlots,
                },),
              );
              if (!validated.ok) { return workflowInvalid(validated.errors,); }

              const name = typeof body.name === "string" ? body.name.trim() : row.name;
              const description = body.description === undefined
                ? row.description
                : String(body.description,);
              const modelFamily = body.model_family === undefined
                ? row.model_family
                : String(body.model_family,);
              const serialized = serializeTemplateInput({
                modality: "workflow",
                name,
                description,
                model_family: modelFamily,
                detail_level: row.detail_level,
                payload: validated.payload,
              },);
              if (!serialized.ok) { return workflowInvalid([serialized.error,],); }

              await database.updateTable("prompt_templates",).set({
                name,
                description,
                model_family: modelFamily,
                payload: serialized.payload,
                lora_slots: slotsColumn(validated.payload.loraSlots,),
                min_vram: typeof body.min_vram === "number" ? body.min_vram : row.min_vram,
                updated_at: new Date().toISOString(),
              },).where("id", "=", id,).where("modality", "=", "workflow",).execute();

              invalidateWorkflowRegistry();
              log().info("workflow row updated", { id, },);
              return jsonResponse({ id, name, },);
            },
            {
              body: UpdateBody,
              response: {
                200: t.Unknown(),
                400: ErrorResponse,
                401: ErrorResponse,
                403: ErrorResponse,
                404: ErrorResponse,
              },
            },
          ),)
  );
}
