// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * UI-format upload ingest for the admin ComfyUI workflow surface.
 *
 * A UI-format editor save needs a pinned `/object_info` snapshot and an
 * expected output kind before `ingestWorkflow` can run it; neither travels
 * with the upload today, so the only honest snapshot source is the live
 * ComfyUI server. When the server is unreachable the upload is refused with
 * the discovery error, not guessed against.
 * @module routes/admin-comfyui-workflows/ui-ingest
 */
import type {
  ConverterError,
  ObjectInfoSnapshot,
  UiWorkflow,
} from "../../generation/comfyui-converter/types";
import type { ParameterDerivationError, } from "../../generation/comfyui-params/errors";
import {
  IngestError,
  type IngestResult,
  ingestWorkflow,
} from "../../generation/comfyui-params/ingest";
import type { ComfyUINodeInfo, } from "../../generation/providers/comfyui";
import { CATEGORIES, } from "../../generation/workflow-library/validate";
import { ComfyUIEditProvider, } from "../../image-edit/providers/comfyui-provider";
import type { ImageEditCategory, TemplateParameter, } from "../../image-edit/types";
import type { UiFormatUpload, WorkflowMetaInput, } from "./payload";

/** What the UI-format ingest path needs beyond the upload itself. */
export interface UiIngestDeps {
  readonly snapshot: ObjectInfoSnapshot;
  readonly expectedOutputKind: string;
}

/** A UI-format upload plus the row id ingest should stamp. */
export interface UiIngestInput {
  readonly upload: UiFormatUpload;
  readonly workflowId: string;
  readonly meta: WorkflowMetaInput;
  readonly deps: UiIngestDeps;
  readonly existing?: readonly TemplateParameter[];
}

/**
 * Narrow an operator category string onto the ingest union.
 * @param category - Raw category off the request metadata
 * @returns {ImageEditCategory}
 */
export function categoryOf(category: unknown,): ImageEditCategory {
  return typeof category === "string" && (CATEGORIES as readonly string[]).includes(category,)
    ? category as ImageEditCategory
    : "txt2img";
}

/**
 * Read one operator-supplied output kind, defaulting to image.
 * @param meta - Request metadata carrying the optional kind
 * @returns {string}
 */
export function outputKindOf(meta: WorkflowMetaInput,): string {
  return typeof meta.expectedOutputKind === "string" && meta.expectedOutputKind.length > 0
    ? meta.expectedOutputKind
    : "image";
}

/**
 * Project live `/object_info` node info onto the pinned snapshot shape.
 *
 * Live entries carry `display_name`/`category`/`output` the converter never
 * reads; the snapshot keeps `input` plus `input_order`, which the live server
 * does not send — positional widget mapping falls back to declaration order.
 * @param info - Live node info keyed by class name
 * @returns {ObjectInfoSnapshot}
 */
export function snapshotOf(info: Record<string, ComfyUINodeInfo>,): ObjectInfoSnapshot {
  const snapshot: Record<string, ObjectInfoSnapshot[string]> = {};
  for (const [name, entry,] of Object.entries(info,)) {
    const required = Object.keys(entry.input.required ?? {},);
    const optional = Object.keys(entry.input.optional ?? {},);
    snapshot[name] = {
      input: {
        required: entry.input.required as Record<string, readonly unknown[]> | undefined,
        optional: entry.input.optional as Record<string, readonly unknown[]> | undefined,
      },
      input_order: { required, optional, },
    };
  }

  return snapshot;
}

/**
 * Fetch the live snapshot for a UI-format ingest, or explain why not.
 * @returns {Promise<{ ok: true; snapshot: ObjectInfoSnapshot } | { ok: false; error: string }>}
 */
export async function liveSnapshot(): Promise<
  { ok: true; snapshot: ObjectInfoSnapshot } | { ok: false; error: string }
> {
  try {
    const info = await new ComfyUIEditProvider().getNodeInfo();
    return { ok: true, snapshot: snapshotOf(info,), };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error,), };
  }
}

/**
 * Run `ingestWorkflow` on an uploaded UI-format file.
 * @param input - Upload, row id, metadata, and the snapshot/output kind
 * @throws {IngestError} When the upload is not UI-format
 * @throws {ConverterError} When conversion fails — nothing is stored
 * @throws {ParameterDerivationError} When derivation fails — nothing is stored
 * @returns A storable row on green, diagnostics without a row on red
 */
export function ingestUpload(input: UiIngestInput,): IngestResult {
  const { upload, workflowId, meta, deps, existing, } = input;
  return ingestWorkflow({
    workflow: upload as unknown as UiWorkflow,
    workflowId,
    snapshot: deps.snapshot,
    expectedOutputKind: deps.expectedOutputKind,
    category: categoryOf(meta.category,),
    ...(existing === undefined ? {} : { existing, }),
  },);
}

/**
 * Surface an ingest throw or red probe through the route's 400 convention.
 * @param error - The ingest throw, or the red result's probe errors
 * @returns {string[]}
 */
export function ingestErrors(
  error: IngestError | ConverterError | ParameterDerivationError | readonly string[],
): string[] {
  if (Array.isArray(error,)) { return [...error,]; }
  if (error instanceof Error) { return [error.message,]; }

  return ["workflow ingest failed",];
}
