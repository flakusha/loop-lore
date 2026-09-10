// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Model-backed prompt improvement (BYOK local-models slice).
 *
 * Runs gradation levels beyond deterministic cleanup through the downloaded
 * browser model: per-level system instructions, readiness gating (never a
 * surprise multi-hundred-MB download), and output normalization.
 *
 * @module alpine/local-model-improve
 */

import { BROWSER_MODEL_CATALOG, } from "../../inference/manifest";
import type { LocalEngine, } from "./local-engine";
import { LocalInferenceUnavailable, } from "./local-inference";
import type { LocalInferenceResult, } from "./local-inference";

/** Default model for model-backed levels (smallest catalog entry). */
export const DEFAULT_LOCAL_MODEL_ID = "SmolLM2-360M-Instruct";

/**
 * localStorage key recording a successfully loaded model. The composer only
 * attempts local model inference for flagged models — never surprise
 * multi-hundred-MB downloads. Weights themselves are cached by transformers.js.
 */
export function modelReadyKey(modelId: string,): string {
  return `local-inference-model:${modelId}`;
}

/** Whether a model finished at least one successful load. */
export function isModelReady(modelId: string,): boolean {
  try {
    return localStorage.getItem(modelReadyKey(modelId,),) === "1";
  } catch {
    return false;
  }
}

/** Persist a successful model load. */
export function markModelReady(modelId: string,): void {
  try {
    localStorage.setItem(modelReadyKey(modelId,), "1",);
  } catch {
    /* storage unavailable — model simply won't be reused */
  }
}

/** Forget a model (used when the user deletes it). */
export function clearModelReady(modelId: string,): void {
  try {
    localStorage.removeItem(modelReadyKey(modelId,),);
  } catch {
    /* already forgotten */
  }
}

/** Per-level system instructions for model-backed improvement. */
const LEVEL_INSTRUCTIONS: Record<string, string> = {
  wording: "Rewrite the draft for clarity and flow. Reply with only the rewritten text, no commentary.",
  expand:
    "Expand the draft with vivid sensory detail, staying consistent with its content. Reply with only the expanded text, no commentary.",
  strict:
    "Apply a strict rewrite: fix spelling, grammar, and punctuation, tighten wording, preserve meaning. Reply with only the corrected text, no commentary.",
  creative: "Rewrite the draft with a bolder, more original voice. Reply with only the rewritten text, no commentary.",
  "style-chat":
    "Rewrite the draft in a natural chat roleplay voice. Reply with only the rewritten text, no commentary.",
  "style-group":
    "Rewrite the draft in a natural group-chat roleplay voice. Reply with only the rewritten text, no commentary.",
};

/** Pull text out of a transformers.js `generated_text` payload (string or chat array). */
function textOf(value: unknown,): string | null {
  if (typeof value === "string") { return value; }
  if (Array.isArray(value,)) {
    for (let index = value.length - 1; index >= 0; index--) {
      const text = textOf(value[index],);
      if (text) { return text; }
    }
    return null;
  }
  if (value && typeof value === "object") {
    if ("generated_text" in value) {
      const text = textOf(value.generated_text,);
      if (text) { return text; }
    }
    if ("content" in value) { return textOf(value.content,); }
    return null;
  }
  return null;
}

/**
 * Normalize raw model output: last assistant turn, echo-trimmed.
 * @param raw - Raw `generated_text` payload.
 * @param echo - Prompt text to strip when the model echoes it.
 * @returns Cleaned text (possibly empty — callers treat empty as unavailable).
 */
export function extractGeneratedText(raw: unknown, echo?: string,): string {
  let text = textOf(raw,) ?? "";
  text = text.trim();
  if (echo && text.startsWith(echo,)) { text = text.slice(echo.length,).trim(); }
  return text;
}

/**
 * Run a model-backed prompt level through the browser engine.
 * @param engine - Engine handle (loads the model on first use).
 * @param opts - Draft, level, and optional model override.
 * @param opts.text - Draft to improve.
 * @param opts.level - Gradation level (must have a local instruction).
 * @param opts.modelId - Catalog model id (default smallest).
 * @param opts.maxTokens - Generation cap (default 256).
 * @returns Local result; engine mirrors the catalog descriptor.
 * @throws {LocalInferenceUnavailable} When the level, model, or output is unusable.
 */
export async function runLocalModelImprove(
  engine: LocalEngine,
  opts: { text: string; level: string; modelId?: string; maxTokens?: number },
): Promise<LocalInferenceResult> {
  const instruction = LEVEL_INSTRUCTIONS[opts.level];
  if (!instruction) {
    throw new LocalInferenceUnavailable(`level "${opts.level}" has no local model prompt`,);
  }
  const modelId = opts.modelId ?? DEFAULT_LOCAL_MODEL_ID;
  if (!isModelReady(modelId,)) {
    throw new LocalInferenceUnavailable(`model "${modelId}" is not downloaded`,);
  }
  const descriptor = BROWSER_MODEL_CATALOG.find((m,) => m.id === modelId);
  if (!descriptor) {
    throw new LocalInferenceUnavailable(`unknown browser model "${modelId}"`,);
  }
  await engine.loadModel(modelId,);
  const raw = await engine.generate(
    [
      { role: "system", content: instruction, },
      { role: "user", content: opts.text, },
    ],
    opts.maxTokens ?? 256,
  );
  const content = extractGeneratedText(raw, opts.text,);
  if (!content) { throw new LocalInferenceUnavailable("model returned empty text",); }
  markModelReady(modelId,);
  return { content, engine: descriptor.engine, local: true, };
}
