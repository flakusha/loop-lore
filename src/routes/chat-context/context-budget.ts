// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat context budget — FEAT-068 budget advisor computation.
 *
 * Computes the per-section token breakdown for a chat via the prompt
 * assembler, plus the available budget and trim suggestions. The context
 * budget itself (per-chat override > model capability registry > default)
 * and the message-based used-token fallback are resolved by the handler so
 * this module stays focused on the advisor output. Kept separate from
 * handlers.ts to stay under the 250L size gate.
 */
import type { Kysely, } from "kysely";
import { PromptAssembler, } from "../../assistant/prompt-assembler";
import {
  availableTokens,
  computeSections,
  getThresholdState,
  suggestTrims,
} from "../../chat";
import type { ContextSection, } from "../../chat";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { resolveProvider, } from "../../generation/providers/registry";

/** Context state payload returned by the context endpoint. */
export interface ContextBudgetResult {
  currentTokens: number;
  maxTokens: number;
  percentage: number;
  status: string;
  threshold: string;
  willTrim: boolean;
  available: number;
  sections: ContextSection[];
  suggestions: { section: string; tokens: number; message: string }[];
}

/**
 * Per-section budget breakdown for a chat.
 *
 * Assembles the prompt the real generation would receive and derives
 * per-section token counts. Returns an empty section list on any failure so
 * the caller can fall back to the message-based estimate.
 * @param database - Kysely db handle
 * @param config - App config (provider defaults)
 * @param chatId - Target chat
 * @param actorId - Actor to assemble the prompt for (chat participant)
 * @param userId - Requesting user (enables impersonation/persona section)
 * @param maxTokens - Resolved context budget
 * @returns Section breakdown plus the used token total
 */
export async function assembleBudgetSections(
  database: Kysely<DB>,
  config: Config,
  chatId: string,
  actorId: string,
  userId: string | null,
  maxTokens: number,
): Promise<{ sections: ContextSection[]; usedTokens: number }> {
  try {
    const resolved = await resolveProvider({ config, db: database, },);
    const assembled = await new PromptAssembler(database,).assemble({
      actorId,
      chatId,
      modelId: resolved.resolvedModel,
      providerId: resolved.resolvedProviderName,
      tokenBudget: maxTokens,
      userId: userId ?? undefined,
      task: "chat-reply",
    },);
    return {
      sections: computeSections(assembled.sections, maxTokens,),
      usedTokens: assembled.tokenCount,
    };
  } catch {
    return { sections: [], usedTokens: 0, };
  }
}

/**
 * Build the full context budget result for a chat.
 *
 * Prefers the per-section breakdown from prompt assembly; when that is
 * unavailable (no actor / assembly failure), falls back to the handler's
 * message-based token estimate.
 * @param database - Kysely db handle
 * @param config - App config
 * @param chatId - Target chat
 * @param actorId - Actor for prompt assembly (chat participant), if any
 * @param userId - Requesting user
 * @param maxTokens - Resolved context budget (handler-owned resolution)
 * @param fallbackUsedTokens - Message-based used-token estimate for fallback
 * @returns Completed budget result
 */
export async function computeBudgetResult(
  database: Kysely<DB>,
  config: Config,
  chatId: string,
  actorId: string | null,
  userId: string | null,
  maxTokens: number,
  fallbackUsedTokens: number,
): Promise<ContextBudgetResult> {
  let sections: ContextSection[] = [];
  let usedTokens = fallbackUsedTokens;
  if (actorId) {
    const assembled = await assembleBudgetSections(
      database,
      config,
      chatId,
      actorId,
      userId,
      maxTokens,
    );
    sections = assembled.sections;
    if (sections.length > 0) { usedTokens = assembled.usedTokens; }
  }

  const percentage = maxTokens > 0 ? Math.round((usedTokens / maxTokens) * 100,) : 0;
  const threshold = getThresholdState(percentage,);
  const suggestions = suggestTrims(sections, percentage,);

  return {
    currentTokens: usedTokens,
    maxTokens,
    percentage,
    status: threshold,
    threshold,
    willTrim: threshold === "imminent",
    available: availableTokens(usedTokens, maxTokens,),
    sections,
    suggestions,
  };
}
