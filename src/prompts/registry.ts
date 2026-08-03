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
  INTENT_CLASSIFIER_PROMPT,
  MEMORY_EXTRACTION_PROMPT,
  TRANSITION_CLASSIFIER_PROMPT,
} from "../aux-pipeline/prompts";
import type { LlmTemplateConfig, } from "../config/sections/templates";
import { ASSISTANT_SYSTEM_PROMPT, } from "./assistant-system";
import { VN_CHOICES_PROMPT, VN_STORY_PROMPT, } from "./vn";

/** Default GM system prompt (used when neither chat config nor template set). */
export const GM_SYSTEM_PROMPT =
  "You are the Game Master for an RPG story. Narrate the scene, control NPCs, and advance the plot in character.";

/**
 * Default NSFW content-rating classification prompt.
 *
 * Ready for wiring into an LLM-based NSFW policy path; currently no in-tree
 * consumer calls the LLM for NSFW classification (moderation is external /
 * keyword-based), but users can already override or extend it via config.
 */
export const NSFW_POLICY_PROMPT =
  `You are a content rating classifier. Analyze the user message and reply with ONLY a JSON object:
{
  "rating": "sfw" | "nsfw_mild" | "nsfw_moderate" | "nsfw_intense" | "nsfw_extreme",
  "categories": ["violence" | "sexual" | "drugs" | "profanity" | null],
  "confidence": 0.0-1.0
}

Rules:
- "sfw" = safe for all audiences
- "nsfw_mild" = light innuendo, mild profanity, non-graphic violence
- "nsfw_moderate" = implied sexual content, moderate violence
- "nsfw_intense" = explicit sexual content, graphic violence
- "nsfw_extreme" = extreme sexual or violent content
- Return only the JSON object, no commentary`;

/** Purpose → default system prompt (source of truth for LLM text templates). */
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
};

/**
 * Resolve a system prompt for a purpose, preferring the user's config override.
 *
 * @param templates - LLM template config (`config.templates.llm`), may be undefined
 * @param purpose - Prompt purpose key (assistant, gm, nsfw, vn, intent, …)
 * @returns The resolved prompt string; "" when no override and no default exists
 */
export function resolveSystemPrompt(
  templates: LlmTemplateConfig | undefined,
  purpose: string,
): string {
  const configured = templates?.systemPrompts?.[purpose];
  if (configured !== undefined && configured !== "") {
    return configured;
  }
  return LLM_PROMPT_DEFAULTS[purpose] ?? "";
}
