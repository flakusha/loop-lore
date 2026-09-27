// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Create endpoint: ingest an uploaded ComfyUI graph as a library row.
 * @module routes/admin-comfyui-workflows/create
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { DefaultState, } from "../../db/enums-core/flags";
import { LoreEntryStatus, } from "../../db/enums-story/world";
import type { DB, } from "../../db/schema";
import { serializeTemplateInput, } from "../../generation/template-service/crud";
import { invalidateWorkflowRegistry, validateWorkflowPayload, } from "../../generation/workflow-library";
import { uid, } from "../../utils";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonCreated, requireUserId, } from "../http-utils";
import { buildWorkflowPayload, readMeta, slotsColumn, uploadedGraph, } from "./payload";
import { log, workflowGuard, workflowInvalid, } from "./shared";

/**
 * Row metadata plus the graph itself. `additionalProperties` stays open so a
 * bare ComfyUI export, whose keys are node ids, passes through untouched.
 */
const CreateBody = t.Object(
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
export function createRoutes(opts: { database: Kysely<DB> }, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "admin-comfyui-workflows-create", },)
      .guard({ beforeHandle: workflowGuard, }, (app,) =>
        app
          // ── Create a workflow row ──────────────────────────────
          .post(
            `${prefix}/admin/comfyui-workflows`,
            async (ctx,) => {
              const userId = requireUserId(ctx,);
              if (typeof userId !== "string") { return userId; }
              // The schema types the known fields but leaves the pass-through
              // graph keys untyped; `readMeta`/`uploadedGraph` do the real
              // narrowing from `unknown` on.
              const body = ctx.body as Record<string, unknown>;

              const graph = uploadedGraph(body,);
              if (!graph) {
                return workflowInvalid([
                  "no ComfyUI graph in request body: send the export as the body, or under workflow/body/graph/payload",
                ],);
              }

              // Ingest gate. The validated payload is what gets stored, so the
              // shape that was checked is the shape on disk.
              const validated = validateWorkflowPayload(buildWorkflowPayload(graph, readMeta(body,),),);
              if (!validated.ok) { return workflowInvalid(validated.errors,); }

              const name = typeof body.name === "string" ? body.name.trim() : "";
              const description = typeof body.description === "string" ? body.description : null;
              const modelFamily = typeof body.model_family === "string" ? body.model_family : null;
              const serialized = serializeTemplateInput({
                modality: "workflow",
                name,
                description,
                model_family: modelFamily,
                detail_level: "balanced",
                payload: validated.payload,
              },);
              if (!serialized.ok) { return workflowInvalid([serialized.error,],); }

              const id = uid();
              const now = new Date().toISOString();
              await database.insertInto("prompt_templates",).values({
                id,
                owner_id: userId,
                modality: "workflow",
                name,
                description,
                model_family: modelFamily,
                detail_level: "balanced",
                payload: serialized.payload,
                created_at: now,
                updated_at: now,
                is_default: DefaultState.NotDefault,
                enabled: LoreEntryStatus.Enabled,
                lora_slots: slotsColumn(validated.payload.loraSlots,),
                min_vram: typeof body.min_vram === "number" ? body.min_vram : null,
              },).execute();

              // The registry is a hydrated snapshot; a new row is invisible to
              // the image-edit template list until it is re-read.
              invalidateWorkflowRegistry();
              log().info("workflow row created", { id, },);
              return jsonCreated({ id, name, },);
            },
            {
              body: CreateBody,
              response: {
                201: t.Unknown(),
                400: ErrorResponse,
                401: ErrorResponse,
                403: ErrorResponse,
              },
            },
          ),)
  );
}
