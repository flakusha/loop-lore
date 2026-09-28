// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Ingest validation for ComfyUI workflow library rows.
 *
 * A malformed workflow stored now fails confusingly at 3am inside a
 * generation queue, so everything checkable without a live ComfyUI is
 * checked at write time and reported back to the operator.
 *
 * Deliberately NOT checked here: whether `requiredNodes` are actually
 * installed. ComfyUI may be down at boot or during an upload, and a library
 * that refuses to store a workflow because a remote is unreachable is worse
 * than one that reports availability at run time. The subset check already
 * exists as `TemplateRegistry.listAvailable`, which is where it belongs.
 *
 * Dead nodes ARE checked here, reusing the Phase 0 rule from
 * `workflow-loader/workflow-validation` so the disk and DB ingest paths can
 * never disagree about what counts as a valid graph.
 */
import type { ImageEditCategory, TemplateParameter, } from "../../image-edit/types";
import type { ComfyUIWorkflow, } from "../providers/comfyui";
import type { WorkflowPayload, } from "../template-types";
import { findDeadNodes, } from "../workflow-loader/workflow-validation";
import { collectPlaceholders, } from "../workflow-substitutor";

/** Every valid `ImageEditCategory`, as a runtime list. The TS type is a union,
 * so the seeder needs this to resolve a filename to a category. */
export const CATEGORIES: readonly ImageEditCategory[] = [
  "txt2img",
  "img2img",
  "inpaint",
  "upscale",
  "controlnet",
];

/** Outcome of validating an untrusted workflow payload. */
export type ValidationResult = { ok: true; payload: WorkflowPayload } | {
  ok: false;
  errors: string[];
};

/** A node is well-formed when it has a class_type and an inputs object. */
function nodeShapeErrors(graph: ComfyUIWorkflow,): string[] {
  const errors: string[] = [];
  for (const [nodeId, node,] of Object.entries(graph,)) {
    if (typeof node?.class_type !== "string" || node.class_type.length === 0) {
      errors.push(`node ${nodeId}: missing class_type`,);
    }
    if (typeof node?.inputs !== "object" || node.inputs === null) {
      errors.push(`node ${nodeId}: missing inputs object`,);
    }
  }
  return errors;
}

/** Every declared parameter name must actually appear as a {{placeholder}}. */
function parameterErrors(parameters: TemplateParameter[], placeholders: Set<string>,): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const param of parameters) {
    if (typeof param?.name !== "string" || param.name.length === 0) {
      errors.push("parameter with empty name",);
      continue;
    }
    if (seen.has(param.name,)) {
      errors.push(`duplicate parameter ${param.name}`,);
    }
    seen.add(param.name,);
    if (!placeholders.has(param.name,)) {
      errors.push(`parameter ${param.name} has no matching {{placeholder}} in the graph`,);
    }
  }
  return errors;
}

/** Each declared LoRA slot must point at a node that exists and matches. */
function loraSlotErrors(payload: WorkflowPayload,): string[] {
  const slots = payload.loraSlots;
  if (!slots) { return []; }
  if (!Array.isArray(slots,)) { return ["loraSlots must be an array",]; }
  const errors: string[] = [];
  for (const [index, slot,] of slots.entries()) {
    const nodeId = typeof slot?.nodeId === "string" ? slot.nodeId : "";
    const node = payload.body[nodeId];
    if (!node) {
      errors.push(`loraSlots[${index}]: no node ${String(slot?.nodeId,)} in graph`,);
      continue;
    }
    if (slot?.classType && node.class_type !== slot.classType) {
      errors.push(
        `loraSlots[${index}]: node ${nodeId} is ${node.class_type}, declared ${slot.classType}`,
      );
    }
  }
  return errors;
}

/** Structural probe for the metadata half of a payload. */
function payloadShapeErrors(value: unknown,): string[] | null {
  if (typeof value !== "object" || value === null || Array.isArray(value,)) {
    return ["payload must be an object",];
  }
  const record = value as Record<string, unknown>;
  const errors: string[] = [];
  const body = record.body;
  if (typeof body !== "object" || body === null || Array.isArray(body,)) {
    errors.push("body must be an object",);
  }
  if (
    typeof record.category !== "string" ||
    !CATEGORIES.includes(record.category as ImageEditCategory,)
  ) {
    errors.push(`category must be one of ${CATEGORIES.join(", ",)}`,);
  }
  if (!Array.isArray(record.parameters,)) { errors.push("parameters must be an array",); }
  if (!Array.isArray(record.requiredNodes,)) { errors.push("requiredNodes must be an array",); }
  return errors.length > 0 ? errors : null;
}

/**
 * Validate an untrusted value as a storable workflow payload.
 *
 * Callers store `result.payload` (not the input) so what lands in the DB is
 * the same shape that was checked.
 * @param value - Untrusted, already JSON-parsed value
 */
export function validateWorkflowPayload(value: unknown,): ValidationResult {
  const shapeErrors = payloadShapeErrors(value,);
  if (shapeErrors) { return { ok: false, errors: shapeErrors, }; }

  const payload = value as WorkflowPayload;
  const errors: string[] = [];

  const graph = payload.body as ComfyUIWorkflow;
  if (Object.keys(graph,).length === 0) { errors.push("body has no nodes",); }
  errors.push(...nodeShapeErrors(graph,),);

  const badRequired = payload.requiredNodes.some(
    (required,) => typeof required !== "string" || required.length === 0,
  );
  if (badRequired) { errors.push("requiredNodes must be non-empty strings",); }

  errors.push(...parameterErrors(payload.parameters, collectPlaceholders(graph,),),);
  errors.push(...loraSlotErrors(payload,),);

  // Same strict rule as the disk loader: reject, do not warn.
  const dead = findDeadNodes(graph,);
  if (dead.length > 0) {
    errors.push(`dead node(s) not linked into the graph: ${dead.join(", ",)}`,);
  }

  return errors.length > 0 ? { ok: false, errors, } : { ok: true, payload, };
}
