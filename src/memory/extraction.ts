// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory extraction service.
 *
 * After each AI response, extracts key facts and stores them as memories.
 * Runs as a background task — the user doesn't wait for it.
 */
import type { Kysely, } from "kysely";
import { callAux, } from "../aux-pipeline";
import type { DB, } from "../db";
import type { GenerationMessage, } from "../generation/gen-types-options";
import { getLogger, } from "../logger";
import { resolveSystemPrompt, } from "../prompts";
import { jsonParseOr, } from "../utils";
import { resolveReviewStatus, storeMemories, } from "./extraction-store";
import type { ExtractedMemory, ExtractionOpts, } from "./types";

/**
 * @returns logger scoped to the memory-extraction module
 */
function getLog() {
  return getLogger().child({ module: "memory-extraction", },);
}

/**
 * Extract memories from an AI response.
 * Uses the shared AUX runner (auxiliary role, 2s timeout, BYO-aware).
 * Returns extracted memories without storing them (caller decides when to store).
 * @param db
 * @param opts
 * @returns extracted memories; empty when the LLM call fails
 */
export async function extractMemories(
  db: Kysely<DB>,
  opts: ExtractionOpts,
): Promise<ExtractedMemory[]> {
  const { actorId, chatId, aiContent, userContent, config, userId, } = opts;

  const contextParts: string[] = [];
  if (userContent) { contextParts.push(`User: ${userContent}`,); }
  contextParts.push(`Assistant: ${aiContent}`,);
  const conversationContext = contextParts.join("\n",);

  const prompt = `${resolveSystemPrompt(config.templates.llm, "memory",)}\n\nConversation:\n${conversationContext}`;
  const messages: GenerationMessage[] = [{ role: "user", content: prompt, },];

  try {
    // Shared AUX policy: 2s timeout, 0.0 temperature, BYO key. 200 max tokens —
    // extraction returns a JSON array, larger than single-field classifiers.
    const response = await callAux("memory", config, db, messages, {
      userId,
      chatId,
      maxTokens: 200,
    },);
    if (!response) {
      getLog().debug("Extraction AUX call failed",);
      return [];
    }

    const parsed = parseExtractionResponse(response.content,);
    if (!parsed) {
      getLog().debug("Failed to parse extraction response",);
      return [];
    }

    const result: ExtractedMemory[] = [];
    for (const m of parsed) {
      if (m.confidence >= 0.5 && m.content.length > 10) { result.push(m,); }
    }
    return result;
  } catch (error) {
    getLog().warn("Extraction failed", { error: (error as Error).message, actorId, chatId, },);
    return [];
  }
}

/**
 * Parse the LLM extraction response into structured memories.
 * @param content
 * @returns parsed memories, or null when the payload held no array
 */
function parseExtractionResponse(content: string,): ExtractedMemory[] | null {
  const trimmed = content.trim();
  let jsonStr: string | null = null;

  if (trimmed.startsWith("[",)) {
    jsonStr = trimmed;
  } else {
    const fenceRe = /```(?:json)?\s*\n?([\s\S]*?)\n?```/;
    const jsonMatch = fenceRe.exec(trimmed,);
    if (jsonMatch?.[1]) { jsonStr = jsonMatch[1]; }

    if (!jsonStr) {
      const arrayRe = /\[[\s\S]*\]/;
      const arrayMatch = arrayRe.exec(trimmed,);
      if (arrayMatch) { jsonStr = arrayMatch[0]; }
    }
  }

  if (!jsonStr) { return null; }
  const result = jsonParseOr<ExtractedMemory[]>(jsonStr, [],);
  return result.length > 0 ? result : null;
}

/**
 * Background extraction hook — call after generation completes.
 * Non-blocking: fires and forgets, errors are logged but don't propagate.
 * @param db
 * @param opts
 */
export async function extractAndStoreMemories(
  db: Kysely<DB>,
  opts: ExtractionOpts,
): Promise<void> {
  try {
    const memories = await extractMemories(db, opts,);
    if (memories.length > 0) {
      await storeMemories(db, opts.actorId, opts.chatId, memories, {
        sourceMessageIds: opts.sourceMessageIds ?? [opts.messageId,],
        sourceChatIds: opts.sourceChatIds ?? [opts.chatId,],
        extractionKind: opts.extractionKind ?? "single_response",
        reviewStatus: await resolveReviewStatus(db, opts,),
        userId: opts.userId ?? null,
      },);
    }
  } catch (error) {
    getLog().warn("Background extraction failed", { error: (error as Error).message, actorId: opts.actorId, },);
  }
}
