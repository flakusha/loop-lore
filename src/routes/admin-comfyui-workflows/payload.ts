// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Turning an operator upload into a storable library payload.
 *
 * A ComfyUI export is a bare API-format graph; the library payload wraps that
 * graph with the metadata the admin UI edits. This module performs the same
 * normalisation as `workflow-library/seed.ts` readPayload, so a file seeded at
 * boot and a graph pasted into the admin UI land in the database in one shape
 * and ingest validation cannot disagree between the two paths.
 *
 * Nothing here validates. `validateWorkflowPayload` is the single ingest gate
 * and runs on every write, before the serialised value is stored.
 */
import type { ComfyUIWorkflow, } from "../../generation/providers/comfyui";
import { isValidWorkflow, } from "../../generation/workflow-loader/workflow-validation";
import { jsonStringifyOr, } from "../../utils";

/** Library metadata an operator may attach to an uploaded graph. */
export interface WorkflowMetaInput {
  category?: unknown;
  parameters?: unknown;
  requiredNodes?: unknown;
  loraSlots?: unknown;
}

/** Wrapper keys a graph may arrive under, in precedence order. */
const GRAPH_KEYS = ["workflow", "body", "graph", "payload",] as const;

function isRecord(value: unknown,): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value,);
}

/**
 * The graph a request body carried, or null when it carried none.
 *
 * Accepts a workflow/body/graph/payload wrapper and a bare graph. A bare body
 * keeps only its object values, so a `name` string mixed in with the nodes is
 * metadata rather than a malformed node.
 * @param body - Untrusted request body
 */
export function uploadedGraph(body: unknown,): ComfyUIWorkflow | null {
  if (!isRecord(body,)) { return null; }
  for (const key of GRAPH_KEYS) {
    const wrapped = body[key];
    if (isValidWorkflow(wrapped,)) { return wrapped; }
  }
  const bare = Object.fromEntries(
    Object.entries(body,).filter(([, value,],) =>
      typeof value === "object" && value !== null && !Array.isArray(value,)
    ),
  );
  return isValidWorkflow(bare,) ? bare : null;
}

/**
 * Library metadata carried alongside the graph in a request body.
 * @param body - Untrusted request body
 */
export function readMeta(body: unknown,): WorkflowMetaInput {
  if (!isRecord(body,)) { return {}; }
  return {
    category: body.category,
    parameters: body.parameters,
    requiredNodes: body.requiredNodes,
    loraSlots: body.loraSlots,
  };
}

/**
 * Build the library payload for a graph, defaulting the metadata the way a
 * seeded file does: txt2img and nothing declared.
 *
 * An unrecognised category is passed through rather than corrected, so
 * `validateWorkflowPayload` reports the operator's typo instead of hiding it.
 * @param graph - API-format graph, already known to be valid
 * @param meta - Metadata from the request or the stored row
 */
export function buildWorkflowPayload(
  graph: ComfyUIWorkflow,
  meta: WorkflowMetaInput = {},
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    body: graph,
    category: typeof meta.category === "string" ? meta.category : "txt2img",
    parameters: Array.isArray(meta.parameters,) ? meta.parameters : [],
    requiredNodes: Array.isArray(meta.requiredNodes,) ? meta.requiredNodes : [],
  };
  if (Array.isArray(meta.loraSlots,)) { payload.loraSlots = meta.loraSlots; }
  return payload;
}

/**
 * Value for the `lora_slots` column, mirroring `payload.loraSlots` so the list
 * endpoint can render slots without parsing every row's payload.
 * @param slots - Declared slots off a validated payload
 */
export function slotsColumn(slots: unknown,): string | null {
  return Array.isArray(slots,) && slots.length > 0 ? jsonStringifyOr(slots,) : null;
}
