// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Prompt Improve — Prompts
 *
 * Level-parameterized system prompts for the unified "improve my prompt"
 * service. One builder per mode so the service stays generic and the prompt
 * engineering stays reviewable in one place.
 */

/** Gradation levels of the improvement service, cheapest to most transformative. */
export type PromptImproveLevel =
  | "spellcheck"
  | "wording"
  | "expand"
  | "strict"
  | "creative"
  | "style-chat"
  | "style-group";

const LEVEL_INSTRUCTIONS: Record<PromptImproveLevel, string> = {
  spellcheck: `Fix spelling mistakes, typos, and punctuation errors in the text.
Do not change word choice, sentence structure, or meaning.
Return ONLY the corrected text — no commentary.`,
  wording: `Improve the text's clarity and word choice. Replace weak or
ambiguous wording with precise alternatives and smooth awkward phrasing.
Preserve the meaning, tone, and approximate length.
Return ONLY the improved text — no commentary.`,
  expand: `Expand the text with richer detail, sensory description, and depth.
Keep every existing fact and beat; add substance, never contradictions.
Aim for roughly twice the original length.
Return ONLY the expanded text — no commentary.`,
  strict: `Rewrite the text in a precise, professional register.
Preserve the exact semantics — no added claims, no dropped statements.
Return ONLY the rewritten text — no commentary.`,
  creative: `Rewrite the text with vivid, expressive, creative language.
The factual intent must survive; style and imagery should flourish.
Return ONLY the rewritten text — no commentary.`,
  "style-chat": `Rewrite the text so it reads like a natural message written by
the same voice that produced the STYLE REFERENCE below: match its diction,
sentence rhythm, register, and formatting habits.
Preserve the meaning exactly.
Return ONLY the rewritten text — no commentary.`,
  "style-group": `Rewrite the text so it fits a lively multi-participant group
chat: match the conversational voice of the STYLE REFERENCE below, keep it
scannable, and make mentions (@name) flow naturally where they already appear.
Preserve the meaning exactly.
Return ONLY the rewritten text — no commentary.`,
};

/** Per-level sampling parameters. `maxTokens` scales with the requested size. */
export const PROMPT_IMPROVE_PARAMS: Record<PromptImproveLevel, { temperature: number; maxTokens: number }> = {
  spellcheck: { temperature: 0, maxTokens: 512, },
  wording: { temperature: 0.2, maxTokens: 768, },
  expand: { temperature: 0.5, maxTokens: 1024, },
  strict: { temperature: 0.1, maxTokens: 768, },
  creative: { temperature: 0.9, maxTokens: 1024, },
  "style-chat": { temperature: 0.7, maxTokens: 768, },
  "style-group": { temperature: 0.7, maxTokens: 768, },
};

/** System prompt for the prompt-analysis mode (JSON classifier). */
export const PROMPT_ANALYSIS_PROMPT = `You are a prompt quality analyst. Analyze the user's draft message
for a roleplay chat and reply with ONLY a JSON object:
{
  "intent": "statement" | "question" | "action" | "narration" | "ooc",
  "clarity": 0.0-1.0,
  "issues": ["short list of concrete problems, if any"],
  "suggestions": ["short list of concrete improvements, if any"],
  "confidence": 0.0-1.0
}

Rules:
- "action" = the user narrates doing something; "narration" = scene-setting prose;
  "ooc" = out-of-character note or question about the chat itself.
- issues/suggestions must be empty arrays when the draft is fine.
- Clamp confidence to [0, 1]; never emit values outside it.`;

/**
 * Build the system prompt for an improvement level, optionally binding the
 * rewrite to a style reference (recent chat messages).
 * @param level - improvement level (`basic` / `style-*` / `detailed`)
 * @param styleContext - recent-message style samples; empty for non-style levels
 * @returns rendered system-prompt string for the LLM.
 */
export function promptImproveSystemPrompt(
  level: PromptImproveLevel,
  styleContext?: string,
): string {
  const base = LEVEL_INSTRUCTIONS[level];
  if (!styleContext) { return base; }
  return `${base}\n\nSTYLE REFERENCE (recent messages, for voice matching only — never copy their content):\n${styleContext}`;
}
