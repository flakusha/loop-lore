// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Update endpoint: edit a workflow's metadata, its graph, or both.
 *
 * A UI-format graph re-upload runs the same convert → derive → probe ingest
 * as create and re-stamps `passing`; API-format edits keep the existing
 * validated-payload path.
 * @module routes/admin-comfyui-workflows/update
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { IngestError, } from "../../generation/comfyui-params/ingest";
import { serializeTemplateInput, } from "../../generation/template-service/crud";
import {
  invalidateWorkflowRegistry,
  rowToPayload,
  validateWorkflowPayload,
} from "../../generation/workflow-library";
import { findDeadNodes, } from "../../generation/workflow-loader/workflow-validation";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonResponse, requireUserId, } from "../http-utils";
import { buildWorkflowPayload, readMeta, slotsColumn, uploadedGraph, uploadedUiWorkflow, } from "./payload";
import { getWorkflowRow, } from "./rows";
import { log, workflowGuard, workflowInvalid, workflowNotFound, } from "./shared";
import { ingestErrors, ingestUpload, liveSnapshot, outputKindOf, } from "./ui-ingest";

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
    expectedOutputKind: t.Optional(t.String(),),
  },
  { additionalProperties: true, },
);

/**
 * @param opts
 * @param opts.database
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { admin: { "comfyui-workflows": { ...; }; }; }; }, { ...; }, { ...; }>}
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

              // UI-format re-upload: convert → derive → probe against the live
              // snapshot, re-stamping `passing`. Operator `existing` params
              // ride along so labels survive the re-ingest.
              const uiUpload = uploadedUiWorkflow(body,);
              if (uiUpload) {
                const snapshot = await liveSnapshot();
                if (!snapshot.ok) {
                  return workflowInvalid([`ComfyUI is unreachable: ${snapshot.error}`,],);
                }

                let ingested;
                try {
                  ingested = ingestUpload({
                    upload: uiUpload,
                    workflowId: id,
                    meta,
                    deps: { snapshot: snapshot.snapshot, expectedOutputKind: outputKindOf(meta,), },
                    existing: current.parameters,
                  },);
                } catch (error) {
                  return workflowInvalid(ingestErrors(error as IngestError,),);
                }

                if (!ingested.ok) { return workflowInvalid(ingestErrors(ingested.probe.errors,),); }

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
                  payload: ingested.payload,
                  unreferencedLive: ingested.report.unreferencedLive,
                },);

                if (!serialized.ok) { return workflowInvalid([serialized.error,],); }

                await database.updateTable("prompt_templates",).set({
                  name,
                  description,
                  model_family: modelFamily,
                  payload: serialized.payload,
                  probe_status: ingested.row.probe_status ?? "passing",
                  lora_slots: slotsColumn(ingested.payload.loraSlots,),
                  min_vram: typeof body.min_vram === "number" ? body.min_vram : row.min_vram,
                  updated_at: new Date().toISOString(),
                },).where("id", "=", id,).where("modality", "=", "workflow",).execute();

                invalidateWorkflowRegistry();
                log().info("workflow row re-ingested from UI-format upload", { id, },);
                return jsonResponse({ id, name, },);
              }

              const graph = uploadedGraph(body,) ?? current.body;
              // A probe-passing row revalidates in converted mode: its graph
              // came from the converter, so the dead-node rule would reject
              // the control/config nodes the editor submits unreferenced.
              // The exemption equals the live graph's own dead set — a fresh
              // API-format upload with a genuinely dead node still fails.
              const converted = uploadedGraph(body,) === null && row.probe_status === "passing"
                ? findDeadNodes(current.body,)
                : [];

              const validated = validateWorkflowPayload(
                buildWorkflowPayload(graph, {
                  category: meta.category ?? current.category,
                  parameters: meta.parameters ?? current.parameters,
                  requiredNodes: meta.requiredNodes ?? current.requiredNodes,
                  loraSlots: meta.loraSlots ?? current.loraSlots,
                },),
                { unreferencedLive: converted, },
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
                unreferencedLive: converted,
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
