// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Prompt template payload shapes (FEAT-065).
 *
 * `prompt_templates.payload` is a JSON column whose shape depends on the
 * row's `modality`. One table serves all generation modalities; these types
 * are the contract for each variant.
 */
import type { TemplateDetailLevel, TemplateModality, } from "../db/enums";
import type { ImageEditCategory, TemplateParameter, } from "../image-edit/types";
import { safeJsonParse, } from "../utils";
import { type ChainPayload, isChainPayloadShape, } from "./builder/chain-types";
import type { ComfyUIWorkflow, } from "./providers/comfyui";

/** One ordered section of an LLM prompt template. */
export interface LlmTemplateSection {
  /**
   * Built-in section builder name (e.g. "system", "chatHistory"). Empty for
   * static sections — those render `content` with variable substitution.
   */
  identifier: string;
  role: "system" | "user" | "assistant";
  /** Static content; may contain {{variables}}. Ignored for linked sections. */
  content: string;
  enabled: boolean;
  /** Token-budget trimming weight (higher = dropped first; 0 = never dropped). */
  priority: number;
}

/** LLM payload: ordered multi-section conversational prompt. */
export interface LlmTemplatePayload {
  sections: LlmTemplateSection[];
}

/** Image payload: single-shot prompt skeleton with {{variables}}. */
export interface ImageTemplatePayload {
  templateBody: string;
  promptFormat?: string;
  genMode?: string;
  negativePrompt?: string;
}

/** Video/audio payload: freeform body + generation params. */
export interface SimpleTemplatePayload {
  body: string;
  params?: Record<string, string>;
}

/** One declared LoRA slot. Phase 4 wires the actual node chain. */
export interface LoraSlot {
  /** Node id in `body` this slot rewires. Must exist. */
  nodeId: string;
  /** Class of the node that must sit at `nodeId`, e.g. "LoraLoader". */
  classType: string;
  /** Human label for the admin UI. */
  label: string;
}

/**
 * ComfyUI workflow payload: an API-format graph plus the metadata the
 * library needs to route, validate, and render it.
 *
 * The graph is stored inline rather than on disk — see the epic's design
 * notes on why there is no config-file writer in this codebase. Building a
 * runnable graph is `substituteWorkflow(body, vars)`, so `body` carries the
 * `{{placeholder}}` tokens verbatim and they are resolved per call.
 */
export interface WorkflowPayload {
  /** ComfyUI API-format graph: node id -> { class_type, inputs }. */
  body: ComfyUIWorkflow;
  /** Drives `GET /image-edit/templates?category=` filtering. */
  category: ImageEditCategory;
  /** Declared parameters. Each `name` must appear as a `{{name}}` in `body`. */
  parameters: TemplateParameter[];
  /** Node class_types required; validated as a subset of installed nodes. */
  requiredNodes: string[];
  /** Declared LoRA slots; each must resolve to a real node in `body`. */
  loraSlots?: LoraSlot[];
}

/** */
export type TemplatePayload =
  | LlmTemplatePayload
  | ImageTemplatePayload
  | SimpleTemplatePayload
  | WorkflowPayload
  | ChainPayload;

/** Full DB row shape for a user-created prompt template. */
export interface PromptTemplateRow {
  id: string;
  owner_id: string;
  modality: TemplateModality;
  name: string;
  description: string | null;
  model_family: string | null;
  detail_level: TemplateDetailLevel;
  payload: string;
  created_at: string;
  updated_at: string;
}

/** Template summary served to list endpoints (rows + presets). */
export interface TemplateSummary {
  id: string;
  modality: TemplateModality;
  name: string;
  description: string | null;
  model_family: string | null;
  detail_level: TemplateDetailLevel;
  isPreset: boolean;
  isOwner: boolean;
}

/**
 * Parse and shape-check a payload JSON string for a modality.
 * @param raw - JSON text from `prompt_templates.payload`
 * @param modality - Expected modality
 * @returns Parsed payload, or null when the JSON is missing/malformed.
 */
export function parseTemplatePayload(
  raw: string,
  modality: TemplateModality,
): TemplatePayload | null {
  const parsed = safeJsonParse<unknown>(raw,);
  if (!parsed.ok) { return null; }
  const value = parsed.value;
  if (typeof value !== "object" || value === null) { return null; }
  const record = value as Record<string, unknown>;

  if (modality === "llm") {
    if (!Array.isArray(record.sections,)) { return null; }
    return value as LlmTemplatePayload;
  }
  if (modality === "image") {
    if (typeof record.templateBody !== "string") { return null; }
    return value as ImageTemplatePayload;
  }
  // `workflow.body` is a graph object, not a template string — it must be
  // branched on before the generic `body` string check below, or a graph
  // would fail the string probe and a workflow row would be unreadable.
  if (modality === "workflow") {
    // Two payload variants share the modality: an inline graph (`body`) and
    // a builder chain (`kind: "chain"` + `steps`). Probe the chain first —
    // a chain has no `body`, so the graph probe alone would reject it.
    if (isChainPayloadShape(record,)) { return value as ChainPayload; }
    if (!isWorkflowPayloadShape(record,)) { return null; }
    return value as WorkflowPayload;
  }
  if (typeof record.body !== "string") { return null; }
  return value as SimpleTemplatePayload;
}

/**
 * Structural probe for a `workflow` payload. Deeper ingest validation lives in `src/generation/workflow-library/`.
 * @param record - parsed payload object
 * @returns `true` when the record has the workflow payload shape.
 */
function isWorkflowPayloadShape(record: Record<string, unknown>,): boolean {
  return typeof record.body === "object" && record.body !== null &&
    typeof record.category === "string" &&
    Array.isArray(record.parameters,) &&
    Array.isArray(record.requiredNodes,);
}
