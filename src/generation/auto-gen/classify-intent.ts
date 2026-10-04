// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { callAux, } from "../../aux-pipeline";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import type { Logger, } from "../../logger";
import { resolveSystemPrompt, } from "../../prompts";
import { clampUnit, jsonParseOr, } from "../../utils";
import { type AssistantTuningOverride, AUTO_GEN_SHORT_REPLY_MAX_TOKENS, } from "../assistant-tuning";

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

/**
 * @param userMessage
 * @param config
 * @param db
 * @param userId
 * @returns {Promise<IntentClassification | null>}
 */
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
  if (!parsed.intent) { return null; }

  // Confidence is contractually `[0, 1]`; clamp out-of-range values and fall
  // back to 0.5 for non-finite input so downstream heuristics that branch on
  // confidence thresholds cannot be tricked by prompt-injected tool-result JSON.
  const rawConfidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;

  return {
    intent: parsed.intent,
    confidence: clampUnit(rawConfidence,),
    shortReply: parsed.shortReply ?? false,
  };
}

/**
 * Short-reply heuristic: skip the main model when the per-chat override pins
 * maxTokens or the user message classifies as a low-confidence short reply.
 * Moved out of call-llm.ts so that file stays under the 250L size gate.
 * @param opts
 * @param opts.assistantTuning
 * @param opts.userMessage
 * @param opts.config
 * @param opts.database
 * @param opts.log
 * @returns true when the short-reply sampling path applies
 */
export async function detectShortReply(opts: {
  assistantTuning?: AssistantTuningOverride;
  userMessage?: string;
  config: Config;
  database: Kysely<DB>;
  log: Logger;
},): Promise<boolean> {
  if ((opts.assistantTuning?.maxTokens ?? null) !== null) { return false; }
  if (!opts.userMessage) { return false; }
  const intent = await classifyIntent(opts.userMessage, opts.config, opts.database,);
  if (!intent?.shortReply || intent.confidence <= 0.7) { return false; }
  opts.log.info("Auxiliary model: short reply detected", {
    intent: intent.intent,
    confidence: intent.confidence,
    maxTokens: AUTO_GEN_SHORT_REPLY_MAX_TOKENS,
  },);

  return true;
}
