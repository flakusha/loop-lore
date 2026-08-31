// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW content classifiers — keyword detection and LLM fallback.
 * Extracted from nsfw-hook.ts for the 250L size gate.
 */

import type { callAux, } from "../../aux-pipeline";
import { getLogger, } from "../../logger";
import { resolveSystemPrompt, } from "../../prompts";
import { jsonParseOr, } from "../../utils/safe-json";
import type { HookContext, } from "./types";

/** */
export type NsfwLevel = "none" | "mild" | "moderate" | "intense" | "extreme";

/**
 * Keyword-based NSFW classifier.
 * Deterministic, fast — runs before any LLM check.
 * @param content
 */
export function detectNsfwLevel(content: string,): NsfwLevel {
  // No keyword extreme tier: "extreme" is LLM-only (detectNsfwWithLlm), reachable
  // via NSFWContentRating.NSFW_EXTREME. Re-add an extremeKeywords array + loop here to restore.
  const lower = content.toLowerCase();
  const intenseKeywords = ["explicit", "graphic", "violent", "brutal", "gore",];
  const moderateKeywords = ["suggestive", "provocative", "steamy", "passionate", "arousing",];
  const mildKeywords = ["flirt", "attractive", "beautiful", "handsome", "charming",];

  for (const kw of intenseKeywords) {
    if (lower.includes(kw,)) { return "intense"; }
  }
  for (const kw of moderateKeywords) {
    if (lower.includes(kw,)) { return "moderate"; }
  }
  for (const kw of mildKeywords) {
    if (lower.includes(kw,)) { return "mild"; }
  }
  return "none";
}

/**
 * LLM content-rating fallback. Calls the shared AUX runner with the
 * config-driven nsfw purpose prompt. Any failure degrades to "none" —
 * the hook must never block generation on an LLM error (graceful, like
 * every other aux classifier).
 * @param content - User message content to classify
 * @param context - Hook context (carries config + db)
 * @param callAuxFn - Injectable AUX runner
 * @returns The mapped NSFW level, or "none" on failure/sfw
 */
export async function detectNsfwWithLlm(
  content: string,
  context: HookContext,
  callAuxFn: typeof callAux,
): Promise<NsfwLevel> {
  try {
    const messages = [
      {
        role: "system" as const,
        content: resolveSystemPrompt(context.config.templates.llm, "nsfw",),
      },
      { role: "user" as const, content: content.slice(0, 500,), },
    ];
    const response = await callAuxFn("nsfw", context.config, context.db, messages, {
      userId: context.userId,
      chatId: context.chatId,
      temperature: 0,
      maxTokens: 50,
    },);
    if (!response) { return "none"; }

    const parsed = jsonParseOr<{ rating?: string }>(response.content, {},);
    const rating = parsed?.rating;
    switch (rating) {
      case "nsfw_mild": {
        return "mild";
      }
      case "nsfw_moderate": {
        return "moderate";
      }
      case "nsfw_intense": {
        return "intense";
      }
      case "nsfw_extreme": {
        return "extreme";
      }
      case undefined: {
        return "none"; // rating missing
      }
      default: {
        return "none"; // sfw or unparseable
      }
    }
  } catch {
    getLogger()
      .child({ module: "nsfw-hook", },)
      .debug("nsfw-hook: LLM classifier failed, falling back to none",);
    return "none";
  }
}
