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

/** */
export type TemplatePayload = LlmTemplatePayload | ImageTemplatePayload | SimpleTemplatePayload;

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
  let value: unknown;
  try {
    value = JSON.parse(raw,);
  } catch {
    return null;
  }
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
  if (typeof record.body !== "string") { return null; }
  return value as SimpleTemplatePayload;
}
