// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Prompt Improve — unified "improve my prompt" service.
 *
 * One policy for every prompt-improvement entry point: AUX-backed
 * (see ../aux-pipeline), per-level gradation, graceful local fallback.
 */
export {
  PROMPT_ANALYSIS_PROMPT,
  PROMPT_IMPROVE_PARAMS,
  type PromptImproveLevel,
  promptImproveSystemPrompt,
} from "./prompts";
export {
  analyzePrompt,
  improveOrPolish,
  improvePrompt,
  parseAnalysis,
  polishText,
  type PromptAnalysis,
  type PromptImproveOptions,
  type PromptImproveResult,
} from "./service";
