// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * UI-format workflow ingest: convert → derive → probe → library row.
 *
 * One saved editor file in, one `WorkflowPayload` plus its
 * persistence-ready `WorkflowRow` out — or no row at all. Conversion and
 * derivation throw their named errors; a red probe returns `ok: false`
 * with diagnostics and no row, so nothing partial is ever stored.
 *
 * The gate is the acceptance probe, not the library payload validator:
 * converted UI graphs legitimately contain unreferenced control and
 * config nodes (status switches, resolution holders) that the editor
 * submits too, so the dead-node rule for hand-authored API graphs does
 * not apply here. The probe checks what ingest must guarantee — node
 * classes installed, links resolve, placeholders substitute to typed
 * values, expected output kind asserted — and stays green on the v-0010
 * fixture end-to-end.
 *
 * Pure and offline: the caller reads the file and sidecar, this module
 * only transforms. Re-ingest is idempotent — pass the row's parameters as
 * `existing` and operator labels survive unless the sidecar changed.
 *
 * The probe checklist fields (`probe_status`, `params_reviewed`, `license`)
 * are not wired: they do not exist on `WorkflowRow` yet (only `min_vram`
 * does), and that migration belongs to the sibling row-fields workstream.
 * The probe report travels beside the row in `IngestSuccess` until then.
 *
 * @module comfyui-params/ingest
 */
import type { ImageEditCategory, TemplateParameter, } from "../../image-edit/types";
import { jsonStringifyOr, } from "../../utils";
import { type Brand, brand, } from "../../utils/brands";
import { convertWorkflow, } from "../comfyui-converter/index";
import type { ConverterReport, ConvertOptions, ObjectInfoSnapshot, UiWorkflow, } from "../comfyui-converter/types";
import type { WorkflowPayload, } from "../template-types";
import type { WorkflowRow, } from "../workflow-library/row";
import { isValidWorkflow, } from "../workflow-loader/workflow-validation";
import { applyNodeOverrides, } from "../workflow-substitutor";
import { deriveParameters, } from "./derive";
import { type ProbeResult, runAcceptanceProbe, } from "./probe";
import type { SidecarOverrides, } from "./sidecar";

/** Ingest workflow identity: the library row id the ingest produces. */
export type IngestWorkflowId = Brand<string, "IngestWorkflowId">;

/** A saved workflow's format, sniffed before conversion. */
export type WorkflowFormat = "ui" | "api";

/** Ingest failure modes, thrown as `IngestError` causes. */
export type IngestFailure =
  | { readonly kind: "ambiguous-format" }
  | { readonly kind: "unrecognized-format" }
  | { readonly kind: "api-format" };

/**
 * Thrown when a workflow cannot enter the UI-format ingest path.
 * @throws Never thrown implicitly — this IS the thrown type.
 */
export class IngestError extends Error {
  readonly failure: IngestFailure;
  constructor(failure: IngestFailure,) {
    super(`comfyui-ingest: ${failure.kind}: ${describeIngestFailure(failure,)}`,);
    this.name = "IngestError";
    this.failure = failure;
  }
}

function describeIngestFailure(failure: IngestFailure,): string {
  switch (failure.kind) {
    case "ambiguous-format":
      return "value matches both UI-format (nodes array) and API-format (class_type map)";
    case "unrecognized-format":
      return "value is neither UI-format (nodes array) nor API-format (class_type map)";
    case "api-format":
      return "API-format graphs ingest through the existing payload path, not UI-format ingest";
  }
}

/**
 * Sniff a saved workflow's format before ingest.
 * @param value - Parsed workflow JSON of unknown shape
 * @throws {IngestError} On ambiguous or unrecognized shapes — never a guess
 * @returns The detected format
 */
export function sniffWorkflowFormat(value: unknown,): WorkflowFormat {
  const nodes = typeof value === "object" && value !== null && "nodes" in value
    ? value.nodes
    : undefined;

  const isUi = Array.isArray(nodes,);
  const isApi = isValidWorkflow(value,);
  if (isUi && isApi) {
    throw new IngestError({ kind: "ambiguous-format", },);
  }

  if (isUi) { return "ui"; }
  if (isApi) { return "api"; }
  throw new IngestError({ kind: "unrecognized-format", },);
}

/** Options for {@link ingestWorkflow}. */
export interface IngestOptions {
  readonly workflow: UiWorkflow;
  readonly workflowId: string;
  readonly snapshot: ObjectInfoSnapshot;
  readonly expectedOutputKind: string;
  readonly category: ImageEditCategory;
  readonly sidecar?: SidecarOverrides;
  readonly existing?: readonly TemplateParameter[];
  readonly convertOptions?: ConvertOptions;
}

/** A green ingest: validated payload, storable row, and the reports. */
export interface IngestSuccess {
  readonly ok: true;
  readonly row: WorkflowRow;
  readonly payload: WorkflowPayload;
  readonly report: ConverterReport;
  readonly probe: ProbeResult;
}

/** A red ingest: the probe report only — no row was produced or stored. */
export interface IngestRejection {
  readonly ok: false;
  readonly report: ConverterReport;
  readonly probe: ProbeResult;
}

/** Outcome of {@link ingestWorkflow}. */
export type IngestResult = IngestSuccess | IngestRejection;

/**
 * Ingest a saved UI-format workflow into a persistence-ready library row.
 * @param options - Workflow, row id, snapshot, output kind, category, sidecar
 * @throws {IngestError} When the input is not UI-format
 * @throws {ConverterError} When conversion fails — nothing is stored
 * @throws {ParameterDerivationError} When derivation fails — nothing is stored
 * @returns A storable row on green, diagnostics without a row on red
 */
export function ingestWorkflow(options: IngestOptions,): IngestResult {
  const { workflow, workflowId, snapshot, expectedOutputKind, category, } = options;
  if (sniffWorkflowFormat(workflow,) !== "ui") {
    throw new IngestError({ kind: "api-format", },);
  }

  const converted = convertWorkflow(workflow, snapshot, options.convertOptions ?? {},);
  const derived = deriveParameters({
    workflow,
    converted: converted.graph,
    workflowId,
    snapshot,
    sidecar: options.sidecar ?? {},
    existing: options.existing,
  },);

  const overrides = new Map<string, Record<string, unknown>>();
  for (const [nodeId, fields,] of derived.overrides) {
    overrides.set(nodeId, { ...fields, },);
  }

  const body = applyNodeOverrides(converted.graph, overrides,);
  const requiredNodes = [
    ...new Set(
      Object.values(converted.graph,).map((node,) => node.class_type),
    ),
  ].toSorted();

  const payload: WorkflowPayload = { body, category, parameters: derived.parameters, requiredNodes, };

  const probe = runAcceptanceProbe({ workflowId, graph: converted.graph, derived, snapshot, expectedOutputKind, },);
  if (!probe.ok) {
    return { ok: false, report: converted.report, probe, };
  }

  return {
    ok: true,
    row: {
      id: brand<"IngestWorkflowId">(workflowId,),
      name: workflowId,
      description: null,
      model_family: null,
      payload: jsonStringifyOr(payload,),
      is_default: "not_default",
      enabled: "enabled",
      lora_slots: null,
      min_vram: null,
    },
    payload,
    report: converted.report,
    probe,
  };
}
