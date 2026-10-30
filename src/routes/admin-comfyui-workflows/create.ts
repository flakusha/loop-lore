// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Create endpoint: ingest an uploaded ComfyUI graph as a library row.
 *
 * API-format uploads keep the existing validated-payload path; UI-format
 * editor saves run through `ingestWorkflow` (convert → derive → probe) and
 * persist the returned row with its `passing` probe stamp.
 * @module routes/admin-comfyui-workflows/create
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { DefaultState, } from "../../db/enums-core/flags";
import { LoreEntryStatus, } from "../../db/enums-story/world";
import type { DB, } from "../../db/schema";
import type { IngestError, IngestResult, } from "../../generation/comfyui-params/ingest";
import { serializeTemplateInput, } from "../../generation/template-service/crud";
import { invalidateWorkflowRegistry, validateWorkflowPayload, } from "../../generation/workflow-library";
import { uid, } from "../../utils";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonCreated, requireUserId, } from "../http-utils";
import {
  buildWorkflowPayload,
  readMeta,
  slotsColumn,
  type UiFormatUpload,
  uploadedGraph,
  uploadedUiWorkflow,
  type WorkflowMetaInput,
} from "./payload";
import { log, workflowGuard, workflowInvalid, } from "./shared";
import { ingestErrors, ingestUpload, liveSnapshot, outputKindOf, } from "./ui-ingest";

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
    expectedOutputKind: t.Optional(t.String(),),
  },
  { additionalProperties: true, },
);

/** Inputs for the UI-format create path. One object per repo convention. */
interface UiCreateInput {
  readonly database: Kysely<DB>;
  readonly userId: string;
  readonly body: Record<string, unknown>;
  readonly meta: WorkflowMetaInput;
  readonly upload: UiFormatUpload;
}

/**
 * Persist one UI-format editor save as a library row.
 * @param input - Database, owner, request body, metadata, and the upload
 * @throws {Error} Never — ingest throws surface as 400 responses
 * @returns {Promise<Response>} 201 with the row id, or a 400 carrying the ingest errors
 */
async function createFromUiUpload(input: UiCreateInput,): Promise<Response> {
  const { database, userId, body, meta, upload, } = input;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description : null;
  const modelFamily = typeof body.model_family === "string" ? body.model_family : null;
  if (name.length === 0) { return workflowInvalid(["name is required",],); }

  const snapshot = await liveSnapshot();
  if (!snapshot.ok) { return workflowInvalid([`ComfyUI is unreachable: ${snapshot.error}`,],); }

  const id = uid();
  let ingested: IngestResult;
  try {
    ingested = ingestUpload({
      upload,
      workflowId: id,
      meta,
      deps: { snapshot: snapshot.snapshot, expectedOutputKind: outputKindOf(meta,), },
    },);
  } catch (error) {
    return workflowInvalid(ingestErrors(error as IngestError,),);
  }

  if (!ingested.ok) { return workflowInvalid(ingestErrors(ingested.probe.errors,),); }

  const payload = { ...ingested.payload, };
  const validated = validateWorkflowPayload(payload, { unreferencedLive: ingested.report.unreferencedLive, },);
  if (!validated.ok) { return workflowInvalid(validated.errors,); }

  const serialized = serializeTemplateInput({
    modality: "workflow",
    name,
    description,
    model_family: modelFamily,
    detail_level: "balanced",
    payload: validated.payload,
    unreferencedLive: ingested.report.unreferencedLive,
  },);

  if (!serialized.ok) { return workflowInvalid([serialized.error,],); }

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
    probe_status: ingested.row.probe_status ?? "passing",
    lora_slots: slotsColumn(validated.payload.loraSlots,),
    min_vram: typeof body.min_vram === "number" ? body.min_vram : null,
  },).execute();

  invalidateWorkflowRegistry();
  log().info("workflow row created from UI-format upload", { id, },);
  return jsonCreated({
    id,
    name,
    probe: { ok: ingested.probe.ok, errors: ingested.probe.errors, },
    report: ingested.report,
  },);
}

/**
 * @param opts
 * @param opts.database
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { admin: { "comfyui-workflows": { ...; }; }; }; }, { ...; }, { ...; }>}
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
              const meta = readMeta(body,);

              // UI-format first: an editor save carries a `nodes` array, which
              // the API-format extractor below never matches. The UI path
              // runs convert → derive → probe and persists the returned row.
              const upload = uploadedUiWorkflow(body,);
              if (upload) {
                return await createFromUiUpload({ database, userId, body, meta, upload, },);
              }

              const graph = uploadedGraph(body,);
              if (!graph) {
                return workflowInvalid([
                  "no ComfyUI graph in request body: send the export as the body, or under workflow/body/graph/payload",
                ],);
              }

              // Ingest gate. The validated payload is what gets stored, so the
              // shape that was checked is the shape on disk.
              const validated = validateWorkflowPayload(buildWorkflowPayload(graph, meta,),);
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
