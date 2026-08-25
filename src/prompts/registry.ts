// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * LLM Text Template Registry — purpose-keyed prompt defaults + config overlay.
 *
 * Every LLM generation domain (assistant, gm, nsfw, vn, aux classifiers, …)
 * resolves its system prompt through {@link resolveSystemPrompt}. Resolution:
 *
 *   1. User config override — `configs/templates/llm.yaml` → `systemPrompts[<purpose>]`
 *      (merge strategies extend/override/replace, see templates-loader)
 *   2. Code default — {@link LLM_PROMPT_DEFAULTS}
 *
 * This makes every generation prompt addable/modifiable/overridable from
 * config without code changes.
 */

import {
  GM_TOOL_DETECTION_PROMPT,
  INTENT_CLASSIFIER_PROMPT,
  MEMORY_EXTRACTION_PROMPT,
  NSFW_POLICY_LEVELS_PROMPT,
  NSFW_POLICY_PROMPT,
  TRANSITION_CLASSIFIER_PROMPT,
} from "../aux-pipeline/prompts";
import type { LlmTemplateConfig, } from "../config/sections/templates";
import { ASSISTANT_SYSTEM_PROMPT, } from "./assistant-system";
import type { PromptPurpose, } from "./purposes";
import { VN_CHOICES_PROMPT, VN_STORY_PROMPT, } from "./vn";

// Re-export the NSFW prompts so the public API of `src/prompts/registry.ts`
// (and therefore `src/prompts`) is unchanged: callers that imported
// NSFW_POLICY_PROMPT / NSFW_POLICY_LEVELS_PROMPT from `./registry` keep working.
// The definitions now live in `src/aux-pipeline/prompts.ts` (the AUX barrel's home).
export { NSFW_POLICY_LEVELS_PROMPT, NSFW_POLICY_PROMPT, };

/** Default GM system prompt (used when neither chat config nor template set). */
export const GM_SYSTEM_PROMPT =
  "You are the Game Master for an RPG story. Narrate the scene, control NPCs, and advance the plot in character.";

/**
 * SFW-only variant of {@link NSFW_POLICY_LEVELS_PROMPT} (defined in
 * `../aux-pipeline/prompts.ts`) — injected when NSFW is disallowed (config,
 * chat scope, or admin runtime toggle) so the model gets an explicit
 * restriction instead of the full rating taxonomy. Config-overridable via
 * `configs/templates/llm.yaml` `systemPrompts.nsfwPolicySfw`.
 */
export const NSFW_POLICY_SFW_PROMPT = `Content rating policy. This chat is strictly SFW (safe for work):
- No sexual or romantic-intimate content of any kind.
- Violence stays non-graphic; no gore.
- No profanity beyond mild exclamations.

Rules:
- Decline or redirect any request that pushes toward mature content.
- Fade to black is not sufficient here — do not depict it at all.
- Keep in-character; do not break the fourth wall about this policy.`;

/**
 * Purpose → default system prompt (source of truth for LLM text templates).
 */
export const LLM_PROMPT_DEFAULTS: Record<string, string> = {
  /** Main chat system prompt (generic baseline; actors usually define their own) */
  chat: "You are {{charName}}. {{charDescription}}",
  /** Summarization prompt */
  summarize: "Summarize this conversation concisely.",
  /** Image prompt generation instruction */
  imagePrompt: "Write image generation tags for: {{scene}}",
  /** Out-of-character / GM narration */
  ooc: "You are the game master. Narrate the scene.",
  /** Assistant mode system prompt (seeded assistant actor default) */
  assistant: ASSISTANT_SYSTEM_PROMPT,
  /** GM turn-taking system prompt */
  gm: GM_SYSTEM_PROMPT,
  /** NSFW content-rating classification */
  nsfw: NSFW_POLICY_PROMPT,
  /** NSFW policy system message (SFW/NSFW level taxonomy) for injection */
  nsfwPolicy: NSFW_POLICY_LEVELS_PROMPT,
  /** SFW-only policy injected when NSFW is disallowed */
  nsfwPolicySfw: NSFW_POLICY_SFW_PROMPT,
  /** VN scene description generation */
  vn: VN_STORY_PROMPT,
  /** VN branching choice generation */
  vnChoices: VN_CHOICES_PROMPT,
  /** Aux: chat → scene transition classification */
  transition: TRANSITION_CLASSIFIER_PROMPT,
  /** Aux: pre-generation intent classification */
  intent: INTENT_CLASSIFIER_PROMPT,
  /** Aux: memory extraction */
  memory: MEMORY_EXTRACTION_PROMPT,
  /** Aux: GM tool request detection */
  gmTool: GM_TOOL_DETECTION_PROMPT,
};

/**
 * Resolve a system prompt for a purpose, preferring the user's config override.
 *
 * @param templates - LLM template config (`config.templates.llm`), may be undefined
 * @param purpose - Prompt purpose key (assistant, gm, nsfw, vn, intent, …)
 * @returns The resolved prompt string; "" when no override and no default exists
 *
 * Known purposes are type-checked against {@link PromptPurpose}; custom keys
 * fall back to defaults.
 */
export function resolveSystemPrompt(
  templates: LlmTemplateConfig | undefined,
  purpose: PromptPurpose | (string & {}),
): string {
  const configured = templates?.systemPrompts?.[purpose];
  if (configured !== undefined && configured !== "") {
    return configured;
  }
  return LLM_PROMPT_DEFAULTS[purpose] ?? "";
}
