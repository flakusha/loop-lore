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
import { collectPlaceholders, substituteWorkflow, type SubstitutionVars, } from "../workflow-substitutor";

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

/**
 * Parse a stored row's payload, or null when it no longer validates.
 * @param {WorkflowRow} row
 * @returns {WorkflowPayload | null}
 */
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
 *
 * Unresolved placeholders are an error, not an empty string. A library row
 * that declares no parameters (every seeded row does) would otherwise reach
 * ComfyUI with `text: ""` and no width, and the server would cheerfully return
 * a blank image. Failing here makes the missing metadata visible at the call
 * site instead.
 * @param payload - Validated workflow payload
 * @param params - Caller-supplied parameter values
 * @throws {Error} When a `{{placeholder}}` survives substitution
 * @returns {ComfyUIWorkflow}
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

  // Resolve the needed set from the *body*, before substitution: the
  // substitutor replaces an unknown placeholder with "", so scanning the output
  // would always come back clean.
  //
  // Only a template that declares NO parameters at all is rejected. An
  // unfilled *optional* parameter is legitimate and still collapses to ""; a
  // zero-parameter template whose body has placeholders is a metadata gap, and
  // submitting it would send ComfyUI an empty prompt and return a blank image.
  //
  // "Missing" means the caller passed no such key at all. A key that was
  // supplied but held a non-primitive was deliberately dropped above, and that
  // path already has its own contract — it must not be reported as missing.
  const provided = new Set(Object.keys(params,),);
  const missing = [...collectPlaceholders(payload.body,),].filter((name,) => !provided.has(name,));
  if (payload.parameters.length === 0 && missing.length > 0) {
    throw new Error(
      `workflow has unresolved placeholders: ${missing.join(", ",)}. ` +
        `Declare them as parameters before running this workflow.`,
    );
  }

  return substituteWorkflow(payload.body, vars,) as ComfyUIWorkflow;
}

/**
 * Project a DB row into a registry template.
 *
 * Returns null when the payload is unreadable or the row is disabled — a
 * disabled workflow must not appear in the picker at all.
 * @param row - Stored workflow row
 * @returns {WorkflowTemplate | null}
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
 * @returns {string[]}
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
