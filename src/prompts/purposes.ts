// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Known LLM prompt purposes — the typed set of generation domains resolved
 * through {@link resolveSystemPrompt}.
 *
 * Custom purposes remain legal: configs may define `systemPrompts.<custom>`
 * under any key name and consumers may resolve them, but the twelve purposes
 * below are first-class and type-checked.
 *
 * Legacy purposes (chat/summarize/imagePrompt/ooc) are retained for backward
 * compatibility and documented as dormant — no runtime consumer today (actors
 * define their own `system_prompt`; SD image prompts use the image template
 * system, not this registry).
 */
export const PROMPT_PURPOSES = [
  "chat",
  "summarize",
  "imagePrompt",
  "ooc", // legacy
  "assistant",
  "gm",
  "nsfw",
  "nsfwPolicy",
  "vn",
  "vnChoices", // generation domains
  "transition",
  "intent",
  "memory", // aux classifiers
  "gmTool", // aux classifier
] as const;

/** Union of the known, typed prompt purposes. */
export type PromptPurpose = (typeof PROMPT_PURPOSES)[number];
