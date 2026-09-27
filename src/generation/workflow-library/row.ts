// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Projection between a `prompt_templates` workflow row and the image-edit
 * `WorkflowTemplate` the registry holds.
 *
 * This is the seam that makes uploaded workflows discoverable through
 * `GET /api/v1/image-edit/templates` with no change to that route: it already
 * reads the registry, the registry just needs to learn about DB rows.
 */
import type { WorkflowTemplate, } from "../../image-edit/types";
import { jsonParseOr, } from "../../utils";
import type { ComfyUINodeInfo, ComfyUIWorkflow, } from "../providers/comfyui";
import type { WorkflowPayload, } from "../template-types";
import { substituteWorkflow, type SubstitutionVars, } from "../workflow-substitutor";

/** The columns a workflow library row needs. Matches the generated schema. */
export interface WorkflowRow {
  id: string;
  name: string;
  description: string | null;
  model_family: string | null;
  payload: string;
  is_default: string;
  enabled: string;
  lora_slots: string | null;
  min_vram: number | null;
}

/** Parse a stored row's payload, or null when it no longer validates. */
export function rowToPayload(row: WorkflowRow,): WorkflowPayload | null {
  const parsed = jsonParseOr<unknown>(row.payload, null,);
  if (!parsed || typeof parsed !== "object") { return null; }
  const record = parsed as Record<string, unknown>;
  if (typeof record.body !== "object" || record.body === null) { return null; }
  if (typeof record.category !== "string") { return null; }
  if (!Array.isArray(record.parameters,) || !Array.isArray(record.requiredNodes,)) { return null; }
  return parsed as WorkflowPayload;
}

/**
 * Build the runnable graph for a workflow row.
 *
 * `build` is sync in the registry contract while substitution is pure, so no
 * async is needed. The cast is honest: `Substituted<T>` widens string leaves
 * to number/boolean, and a ComfyUI graph is precisely a JSON object whose
 * node inputs accept either.
 *
 * The registry's `build` contract is `Record<string, unknown>` but
 * substitution only accepts primitives, so non-primitive caller values are
 * dropped rather than stringified — a `{{width}}` must not become "[object
 * Object]".
 * @param payload - Validated workflow payload
 * @param params - Caller-supplied parameter values
 */
export function buildWorkflowGraph(
  payload: WorkflowPayload,
  params: Record<string, unknown>,
): ComfyUIWorkflow {
  const vars: SubstitutionVars = {};
  for (const [key, value,] of Object.entries(params,)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      vars[key] = value;
    }
  }
  return substituteWorkflow(payload.body, vars,) as ComfyUIWorkflow;
}

/**
 * Project a DB row into a registry template.
 *
 * Returns null when the payload is unreadable or the row is disabled — a
 * disabled workflow must not appear in the picker at all.
 * @param row - Stored workflow row
 */
export function rowToTemplate(row: WorkflowRow,): WorkflowTemplate | null {
  if (row.enabled !== "enabled") { return null; }
  const payload = rowToPayload(row,);
  if (!payload) { return null; }
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    category: payload.category,
    backends: ["comfyui",],
    required_nodes: payload.requiredNodes,
    parameters: payload.parameters,
    build: (params: Record<string, unknown>,) => buildWorkflowGraph(payload, params,),
  };
}

/**
 * Which of a row's declared `requiredNodes` are missing from the live server.
 *
 * ComfyUI reports node classes as `ClassName` while the epic's declaration
 * uses bare names, so both spellings are accepted.
 * @param row - Stored workflow row
 * @param installed - Node info as returned by the ComfyUI client
 */
export function missingRequiredNodes(
  row: WorkflowRow,
  installed: readonly ComfyUINodeInfo[],
): string[] {
  const payload = rowToPayload(row,);
  if (!payload) { return []; }
  const names = new Set<string>();
  for (const node of installed) {
    names.add(node.name,);
    names.add(node.name.toUpperCase(),);
  }
  return payload.requiredNodes.filter((required,) => !names.has(required,));
}
