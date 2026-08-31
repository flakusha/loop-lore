// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { callAux, } from "../../aux-pipeline";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { resolveSystemPrompt, } from "../../prompts";
import { clampUnit, jsonParseOr, } from "../../utils";

/**
 * Pre-generation intent check using the auxiliary model.
 *
 * Sends a lightweight classification prompt to the auxiliary model
 * to determine message intent before committing to full generation.
 * Returns null if no auxiliary model is configured or on error.
 */
export interface IntentClassification {
  intent: string;
  confidence: number;
  shortReply: boolean;
}

export async function classifyIntent(
  userMessage: string,
  config: Config,
  db: Kysely<DB>,
  userId?: string,
): Promise<IntentClassification | null> {
  try {
    const messages = [
      { role: "system" as const, content: resolveSystemPrompt(config.templates.llm, "intent",), },
      { role: "user" as const, content: userMessage.slice(0, 500,), },
    ];

    // Shared AUX policy: 2s timeout, 0.0 temperature, 100 max tokens, BYO key
    const response = await callAux("intent", config, db, messages, {
      userId,
      temperature: 0,
      maxTokens: 100,
    },);
    if (!response) { return null; }

    return parseIntentClassification(response.content,);
  } catch {
    // Auxiliary model unavailable — proceed with main generation
    return null;
  }
}

/**
 * Parse and validate a raw AUX-LLM JSON response into an {@link IntentClassification}.
 *
 * Pure and side-effect free — unit-testable without a live provider.
 *
 * @param content - Raw LLM response text
 * @returns Classification, or null if the response is missing `intent`
 *
 * @example
 * parseIntentClassification('{"intent":"chat","confidence":0.8,"shortReply":false}')
 * // { intent: "chat", confidence: 0.8, shortReply: false }
 */
export function parseIntentClassification(content: string,): IntentClassification | null {
  const parsed = jsonParseOr<Partial<IntentClassification>>(content, {},);
  if (typeof parsed.intent !== "string" || parsed.intent === "") { return null; }

  // Confidence is contractually `[0, 1]`; clamp out-of-range values and fall
  // back to 0.5 for non-numeric input. A misbehaving model or prompt-injected
  // tool-result JSON cannot poison downstream heuristics that branch on
  // confidence thresholds.
  const rawConfidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;

  return {
    intent: parsed.intent,
    confidence: clampUnit(rawConfidence,),
    shortReply: parsed.shortReply === true,
  };
}
