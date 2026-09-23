// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Moderation classifiers — keyword tables and LLM severity verdict.
 * Lives beside moderation-hook.ts (mirrors nsfw-classifier.ts): this module
 * owns the detection keyword tables and the AUX-backed verdict so the hook
 * stays under its size gate.
 */

import type { callAux, } from "../../aux-pipeline";
import { getLogger, } from "../../logger";
import { resolveSystemPrompt, } from "../../prompts";
import { jsonParseOr, } from "../../utils/safe-json";
import type { HookContext, } from "./types";

/**
 * Exact word tokens — matched as whole words, case-insensitive. Common
 * morphological variants are listed explicitly because tokenized matching never
 * matches a substring (e.g. "violent" ≠ "violence", "harassment" ≠ "harass").
 */
export const SEVERE_KEYWORDS: readonly { term: string; weight: number }[] = [
  { term: "hate", weight: 3, },
  { term: "hateful", weight: 3, },
  { term: "hatred", weight: 3, },
  { term: "violence", weight: 3, },
  { term: "violent", weight: 3, },
  { term: "violently", weight: 3, },
  { term: "threat", weight: 3, },
  { term: "threaten", weight: 3, },
  { term: "threatened", weight: 3, },
  { term: "threatening", weight: 3, },
  { term: "abuse", weight: 3, },
  { term: "abused", weight: 3, },
  { term: "abusive", weight: 3, },
  { term: "harass", weight: 3, },
  { term: "harassed", weight: 3, },
  { term: "harassment", weight: 3, },
  { term: "harassing", weight: 3, },
];

export const MODERATE_KEYWORDS: readonly { term: string; weight: number }[] = [
  { term: "insult", weight: 2, },
  { term: "insulted", weight: 2, },
  { term: "insulting", weight: 2, },
  { term: "offensive", weight: 2, },
  { term: "offensively", weight: 2, },
  { term: "rude", weight: 2, },
  { term: "rudely", weight: 2, },
  { term: "rudeness", weight: 2, },
  { term: "disrespect", weight: 2, },
  { term: "disrespectful", weight: 2, },
];

/** Valid severity buckets — single source for keyword flags and LLM verdicts. */
export const MODERATION_SEVERITIES = ["severe", "moderate",] as const;

/** Severity bucket shared by keyword flags and LLM verdicts. */
export type ModerationSeverity = (typeof MODERATION_SEVERITIES)[number];

/** Severity verdict from the LLM moderation classifier; null = no verdict (fail-open). */
export type ModerationLlmVerdict = ModerationSeverity | null;

/**
 * LLM severity verdict. Calls the shared AUX runner with the config-driven
 * moderation purpose prompt. Any failure (AUX error, null response,
 * unparseable JSON, "clean"/unknown severity) degrades to null — the hook
 * keeps its keyword verdict (graceful, like every other aux classifier).
 * @param content - User message content to classify
 * @param context - Hook context (carries config + db)
 * @param callAuxFn - Injectable AUX runner
 * @returns "severe" or "moderate", or null on failure/clean
 */
export async function detectModerationWithLlm(
  content: string,
  context: HookContext,
  callAuxFn: typeof callAux,
): Promise<ModerationLlmVerdict> {
  try {
    const messages = [
      {
        role: "system" as const,
        content: resolveSystemPrompt(context.config.templates.llm, "moderation",),
      },
      { role: "user" as const, content: content.slice(0, 500,), },
    ];
    const response = await callAuxFn("moderation", context.config, context.db, messages, {
      userId: context.userId,
      chatId: context.chatId,
      temperature: 0,
      maxTokens: 50,
    },);
    if (!response) { return null; }

    const parsed = jsonParseOr<{ severity?: string }>(response.content, {},);
    switch (parsed?.severity) {
      case "severe": {
        return "severe";
      }
      case "moderate": {
        return "moderate";
      }
      default: {
        return null; // clean, missing, or unknown severity
      }
    }
  } catch {
    getLogger()
      .child({ module: "moderation-hook", },)
      .debug("moderation-hook: LLM classifier failed, keeping keyword verdict",);
    return null;
  }
}
