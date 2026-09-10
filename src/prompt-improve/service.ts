// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { safeJsonParse, } from "../utils";

/**
 * Prompt Improve — Service
 *
 * Unified "improve my prompt" implementation serving every entry point
 * (composer UI, `/improve` slash command, REST route). One policy:
 * AUX-backed, per-level sampling, graceful local-polish fallback —
 * callers never lose the user's text.
 */
import type { Kysely, } from "kysely";
import { callAux, } from "../aux-pipeline/runner";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import {
  PROMPT_ANALYSIS_PROMPT,
  PROMPT_IMPROVE_PARAMS,
  type PromptImproveLevel,
  promptImproveSystemPrompt,
} from "./prompts";

const AUX_TIMEOUT_MS = 15_000;
const MAX_IMPROVE_INPUT_CHARS = 8000;

/** Options for {@link improvePrompt} and {@link analyzePrompt}. */
export interface PromptImproveOptions {
  level: PromptImproveLevel;
  text: string;
  /** Pre-built style reference (recent chat messages) for `style-*` levels. */
  styleContext?: string;
  config: Config;
  db: Kysely<DB>;
  /** User ID for BYO apiKey resolution and telemetry. */
  userId?: string;
  /** Chat ID for telemetry and audit context. */
  chatId?: string;
}

/** Result of a successful improvement. */
export interface PromptImproveResult {
  content: string;
  level: PromptImproveLevel;
  model: string;
  provider: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
}

/** Parsed prompt-analysis profile. */
export interface PromptAnalysis {
  intent: "statement" | "question" | "action" | "narration" | "ooc";
  clarity: number;
  issues: string[];
  suggestions: string[];
  confidence: number;
}

/** */
function getLog() {
  return getLogger().child({ module: "prompt-improve", },);
}

/**
 * Improve the given text through the auxiliary LLM at the requested level.
 * Returns null when the aux path is unavailable or fails — callers apply the
 * local fallback themselves (or use {@link improveOrPolish}).
 * @param options
 */
export async function improvePrompt(options: PromptImproveOptions,): Promise<PromptImproveResult | null> {
  const { level, text, styleContext, config, db, userId, chatId, } = options;
  const trimmed = text.trim();
  if (!trimmed) { return null; }
  const bounded = trimmed.slice(0, MAX_IMPROVE_INPUT_CHARS,);

  const params = PROMPT_IMPROVE_PARAMS[level];
  const result = await callAux("prompt-improve", config, db, [
    { role: "system", content: promptImproveSystemPrompt(level, styleContext,), },
    { role: "user", content: bounded, },
  ], {
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    timeoutMs: AUX_TIMEOUT_MS,
    userId,
    chatId,
  },);
  if (!result) { return null; }
  const content = stripWrappers(result.content,);
  if (!content) { return null; }
  return { ...result, content, level, };
}

/**
 * Improve-or-fallback convenience: never returns empty.
 * @param options
 */
export async function improveOrPolish(options: PromptImproveOptions,): Promise<PromptImproveResult> {
  const improved = await improvePrompt(options,);
  if (improved) { return improved; }
  getLog().debug("AUX improve unavailable — applying local polish", { level: options.level, },);
  return {
    content: polishText(options.text,),
    level: options.level,
    model: "local-heuristics",
    provider: "local",
    latencyMs: 0,
    promptTokens: 0,
    completionTokens: 0,
  };
}

/**
 * Analyze a draft message (intent/clarity profile) through the aux LLM.
 * Returns null when the aux path fails — the analyzer is advisory only.
 * @param options - Only `text`, `config`, `db`, `userId`, `chatId` are read.
 */
export async function analyzePrompt(
  options: Omit<PromptImproveOptions, "level" | "styleContext">,
): Promise<PromptAnalysis | null> {
  const { text, config, db, userId, chatId, } = options;
  const trimmed = text.trim();
  if (!trimmed) { return null; }
  const result = await callAux("prompt-analysis", config, db, [
    { role: "system", content: PROMPT_ANALYSIS_PROMPT, },
    { role: "user", content: trimmed.slice(0, MAX_IMPROVE_INPUT_CHARS,), },
  ], { timeoutMs: AUX_TIMEOUT_MS, userId, chatId, },);
  if (!result) { return null; }
  return parseAnalysis(result.content,);
}

/**
 * Extract and validate the analysis JSON, clamping every numeric field.
 * Hardened like `parseIntentClassification`: malformed/injected payloads can
 * never produce out-of-range confidence.
 * @param raw
 */
export function parseAnalysis(raw: string,): PromptAnalysis | null {
  const start = raw.indexOf("{",);
  const end = raw.lastIndexOf("}",);
  if (start < 0 || end <= start) { return null; }
  const parsed = safeJsonParse(raw.slice(start, end + 1,),);
  if (!parsed.ok) { return null; }
  const value = parsed.value;
  if (typeof value !== "object" || value === null) { return null; }
  const obj = value as Record<string, unknown>;
  const intent = obj.intent;
  if (
    intent !== "statement" && intent !== "question" && intent !== "action" && intent !== "narration" && intent !== "ooc"
  ) {
    return null;
  }
  const issues = toStringArray(obj.issues,);
  const suggestions = toStringArray(obj.suggestions,);
  if (!issues || !suggestions) { return null; }
  return {
    intent,
    clarity: clamp01(obj.clarity,),
    issues,
    suggestions,
    confidence: clamp01(obj.confidence,),
  };
}

/** Local deterministic fallback: capitalization, punctuation, whitespace. */
export function polishText(text: string,): string {
  let result = text.trim();

  // Capitalize first letter
  if (result.length > 0) {
    result = result.charAt(0,).toUpperCase() + result.slice(1,);
  }

  // Ensure ends with punctuation
  if (result.length > 0 && !/[.!?]$/.test(result,)) {
    result += ".";
  }

  // Fix double spaces, space before punctuation, and missing space after it
  result = result
    .replaceAll(/ {2,}/g, " ",)
    .replaceAll(/ ([.,!?;:])/g, "$1",)
    .replaceAll(/([,;:])(\S)/g, "$1 $2",);

  return result;
}

/** Strip wrapping quotes/code fences a chatty model may add around the text. */
function stripWrappers(content: string,): string {
  let out = content.trim();
  const fence = out.match(/^```[a-z]*\n([\s\S]*?)\n```$/,);
  if (fence?.[1]) { out = fence[1].trim(); }
  const quoted = out.match(/^"([\s\S]*)"$/,);
  if (quoted?.[1]) { out = quoted[1].trim(); }
  return out;
}

/** @param value */
function clamp01(value: unknown,): number {
  return typeof value === "number" && Number.isFinite(value,) ? Math.min(1, Math.max(0, value,),) : 0;
}

/**
 * @param value
 * @returns String array, or null when not an array of strings
 */
function toStringArray(value: unknown,): string[] | null {
  if (!Array.isArray(value,)) { return null; }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") { return null; }
    out.push(item,);
  }
  return out;
}
