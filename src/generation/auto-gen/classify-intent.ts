// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { callAux, } from "../../aux-pipeline";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { resolveSystemPrompt, } from "../../prompts";
import { jsonParseOr, } from "../../utils";

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

    const parsed = jsonParseOr<Partial<IntentClassification>>(response.content, {},);
    if (!parsed.intent) { return null; }

    return {
      intent: parsed.intent,
      confidence: parsed.confidence ?? 0.5,
      shortReply: parsed.shortReply ?? false,
    };
  } catch {
    // Auxiliary model unavailable — proceed with main generation
    return null;
  }
}
