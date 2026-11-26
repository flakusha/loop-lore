// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Model metadata extraction ─────────────────────────────

import type { ModelInfo, } from "../types";

/** Type guard: every element a string. */
function isStringArray(value: unknown,): value is string[] {
  return Array.isArray(value,) && value.every((v,) => typeof v === "string");
}

/** Read nested modality only when both sides are string arrays. */
function asModelModality(value: unknown,): ModelInfo["modality"] {
  if (typeof value !== "object" || value === null || Array.isArray(value,)) {
    return undefined;
  }

  const obj = value as Record<string, unknown>;
  return isStringArray(obj.input,) && isStringArray(obj.output,)
    ? { input: [...obj.input,], output: [...obj.output,], }
    : undefined;
}

/**
 * Map an OpenAI-compatible /v1/models entry to ModelInfo.
 * Carries provider-reported fields when present; advisory only.
 * @param raw
 * @returns {ModelInfo}
 */
export function modelInfoFromOpenAi(raw: Record<string, unknown>,): ModelInfo {
  const id = typeof raw.id === "string" ? raw.id : "";
  const info: ModelInfo = { id, raw, };
  const ownedBy = raw.owned_by ?? raw.ownedBy;
  if (typeof ownedBy === "string") { info.ownedBy = ownedBy; }
  if (typeof raw.context_length === "number") { info.contextWindow = raw.context_length; }
  if (typeof raw.max_output === "number") { info.maxOutput = raw.max_output; }
  if (typeof raw.thinking === "boolean") { info.thinking = raw.thinking; }
  if (typeof raw.tool_calling === "boolean") { info.toolCalling = raw.tool_calling; }
  if (Array.isArray(raw.modalities,)) { info.modalities = Array.from(raw.modalities, String,); }
  const modality = asModelModality(raw.modality,);
  if (modality) { info.modality = modality; }
  const sizeMatch = /(\d+(?:\.\d+)?\s*[bB])/i.exec(id,);
  if (sizeMatch) { info.paramSize = sizeMatch[1]!.replaceAll(/\s+/g, "",); }
  return info;
}
