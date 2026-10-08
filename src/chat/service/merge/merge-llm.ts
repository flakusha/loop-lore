// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * LLM prompt assembly, token budget, and safe-parse for content merges
 * (FEA-2026-047). Pure functions — the actual provider call lives in
 * `merge-service.ts` so this module stays unit-testable without a driver.
 */
import type { Config, } from "../../../config/schema";
import { defaultTokenCount, } from "../../../generation/context-window-config";
import type { GenerationMessage, } from "../../../generation/types";
import { resolveSystemPrompt, } from "../../../prompts";
import { safeJsonParse, } from "../../../utils/safe-json";
import type { MergeDraftMessage, MergeError, } from "./merge-criteria";
import { baseOrdinal, modeInstruction, overlayOrdinal, } from "./merge-criteria";

/** Built-in fallback when no `merge` template is configured — never 500s. */
export const MERGE_SYSTEM_PROMPT_FALLBACK =
  "You are a narrative editor merging divergent continuations of one roleplay conversation. " +
  "Preserve established characters, tone, and world state. Output ONLY a JSON array of " +
  '{"role":"assistant"|"user"|"character","content":"..."} objects — no prose, no markdown fences.';

/**
 * Resolve the merge system prompt from config templates, falling back to the
 * built-in constant when the template is missing or empty.
 * @param config
 * @returns {string}
 */
export function resolveMergeSystemPrompt(config: Config,): string {
  return resolveSystemPrompt(config.templates.llm, "merge",) || MERGE_SYSTEM_PROMPT_FALLBACK;
}

/**
 * Token estimate for a rendered line array.
 * @param lines
 */
function estimateLines(lines: string[],): number {
  return lines.reduce((sum, line,) => sum + defaultTokenCount(line,), 0,);
}

/**
 * Token budget plan for the merge prompt.
 *
 * Allocation: shared prefix first, then split the remainder equally across
 * versions. An oversized version keeps head+tail (middle dropped) with
 * `truncated: true`. If the shared prefix alone exceeds the budget →
 * `bad_request` (reject, never silently truncate).
 * @param params
 * @param params.sharedContext rendered shared-prefix lines
 * @param params.versions rendered per-source tail lines (ordinal order)
 * @param params.maxContextTokens model context window
 * @param params.reserveOutputTokens tokens reserved for the LLM output
 * @returns {{ ok: true; sharedPrefix: number; perSource: number[]; truncated: boolean } | MergeError}
 */
export function planMergeBudget(params: {
  sharedContext: string[];
  versions: string[][];
  maxContextTokens: number;
  reserveOutputTokens: number;
},): { ok: true; sharedPrefix: number; perSource: number[]; truncated: boolean } | MergeError {
  const { sharedContext, versions, maxContextTokens, reserveOutputTokens, } = params;
  const budget = maxContextTokens - reserveOutputTokens;
  if (budget <= 0) {
    return { code: "bad_request", message: "Model context too small for merge", };
  }

  const sharedPrefix = estimateLines(sharedContext,);
  if (sharedPrefix > budget) {
    return { code: "bad_request", message: "Branches too large to merge", };
  }

  const remaining = budget - sharedPrefix;
  const perSourceBudget = Math.floor(remaining / Math.max(1, versions.length,),);
  const perSource: number[] = [];
  let truncated = false;

  for (const lines of versions) {
    const tokens = estimateLines(lines,);
    if (tokens <= perSourceBudget) {
      perSource.push(tokens,);
    } else {
      truncated = true;
      perSource.push(perSourceBudget,);
    }
  }

  return { ok: true, sharedPrefix, perSource, truncated, };
}

/**
 * Truncate a line array to a token budget, keeping head+tail.
 * @param lines
 * @param budgetTokens
 * @returns {string[]}
 */
export function truncateLines(lines: string[], budgetTokens: number,): string[] {
  let used = 0;
  const head: string[] = [];
  for (const line of lines) {
    const cost = defaultTokenCount(line,);
    if (used + cost > budgetTokens) { break; }
    head.push(line,);
    used += cost;
  }

  const tail: string[] = [];
  for (let i = lines.length - 1; i >= head.length; i--) {
    const cost = defaultTokenCount(lines[i]!,);
    if (used + cost > budgetTokens) { break; }
    tail.unshift(lines[i]!,);
    used += cost;
  }

  return [...head, ...tail,];
}

/**
 * Assemble the merge prompt messages.
 * @param params
 * @param params.systemPrompt resolved system prompt
 * @param params.sharedContext rendered shared-prefix lines
 * @param params.versions rendered per-source tail lines (ordinal order)
 * @param params.mode merge mode
 * @returns {GenerationMessage[]}
 */
export function buildMergePromptMessages(params: {
  systemPrompt: string;
  sharedContext: string[];
  versions: string[][];
  mode: string;
},): GenerationMessage[] {
  const { systemPrompt, sharedContext, versions, mode, } = params;
  const instruction = modeInstruction(mode as never,);
  const base = baseOrdinal(mode as never,);
  const overlay = overlayOrdinal(mode as never,);

  const sections: string[] = [];
  sections.push("=== SHARED CONTEXT ===",);
  sections.push(...sharedContext,);

  for (const [ordinal, lines,] of versions.entries()) {
    const label = ordinal === 0 ? "first" : ordinal === 1 ? "second" : `source ${ordinal + 1}`;
    sections.push(`=== VERSION ${String.fromCharCode(65 + ordinal,)} ("${label}") ===`,);
    sections.push(...lines,);
  }

  if (instruction) {
    sections.push("=== INSTRUCTION ===",);
    sections.push(instruction,);
  }

  if (base !== null && overlay !== null) {
    sections.push(
      `BASE is version ${String.fromCharCode(65 + base,)}. ` +
        `Apply version ${String.fromCharCode(65 + overlay,)}'s change onto it.`,
    );
  }

  sections.push(
    "Output ONLY a JSON array of " +
      '{"role":"assistant"|"user"|"character","content":"..."} objects.',
  );

  return [
    { role: "system", content: systemPrompt, },
    { role: "user", content: sections.join("\n",), },
  ];
}

/**
 * Parse and shape-validate the LLM output contract.
 * @param text raw LLM response
 * @returns {{ ok: true; messages: MergeDraftMessage[] } | MergeError}
 */
export function parseMergeDraft(
  text: string,
): { ok: true; messages: MergeDraftMessage[] } | MergeError {
  const parsed = safeJsonParse<unknown>(text,);
  if (!parsed.ok || !Array.isArray(parsed.value,)) {
    return { code: "llm_parse", message: "LLM output is not a JSON array", };
  }

  const messages: MergeDraftMessage[] = [];
  for (const item of parsed.value) {
    if (
      typeof item !== "object" || item === null ||
      typeof (item as Record<string, unknown>).role !== "string" ||
      typeof (item as Record<string, unknown>).content !== "string"
    ) {
      return { code: "llm_parse", message: "LLM output item missing role/content", };
    }

    const role = (item as Record<string, unknown>).role;
    if (role !== "assistant" && role !== "user" && role !== "character") {
      return { code: "llm_parse", message: "LLM output item has invalid role", };
    }

    messages.push({ role, content: (item as Record<string, unknown>).content as string, },);
  }

  if (messages.length === 0) {
    return { code: "llm_parse", message: "LLM output is an empty array", };
  }

  return { ok: true, messages, };
}
