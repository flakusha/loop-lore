/**
 * Memory extraction service.
 *
 * After each AI response, extracts key facts and stores them as memories.
 * Runs as a background task — the user doesn't wait for it.
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { callAux, MEMORY_EXTRACTION_PROMPT, } from "../aux-pipeline";
import type { DB, } from "../db";
import type { GenerationMessage, } from "../generation/gen-types-options";
import { getLogger, } from "../logger";
import { jsonParseOr, } from "../utils";
import type { ExtractedMemory, ExtractionOpts, } from "./types";

function getLog() {
  return getLogger().child({ module: "memory-extraction", },);
}

/**
 * Extract memories from an AI response.
 * Uses the shared AUX runner (auxiliary role, 2s timeout, BYO-aware).
 * Returns extracted memories without storing them (caller decides when to store).
 */
export async function extractMemories(
  db: Kysely<DB>,
  opts: ExtractionOpts,
): Promise<ExtractedMemory[]> {
  const { actorId, chatId, aiContent, userContent, config, userId, } = opts;

  const conversationContext = [
    userContent ? `User: ${userContent}` : "",
    `Assistant: ${aiContent}`,
  ].filter(Boolean,).join("\n",);

  const prompt = `${MEMORY_EXTRACTION_PROMPT}\n\nConversation:\n${conversationContext}`;
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

    return parsed.filter((m,) => m.confidence >= 0.5 && m.content.length > 10);
  } catch (error) {
    getLog().warn("Extraction failed", { error: (error as Error).message, actorId, chatId, },);
    return [];
  }
}

/**
 * Parse the LLM extraction response into structured memories.
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
 * Store extracted memories in the database.
 * Deduplicates against existing memories for the same actor.
 */
export async function storeMemories(
  db: Kysely<DB>,
  actorId: string,
  chatId: string,
  memories: ExtractedMemory[],
): Promise<number> {
  let stored = 0;

  for (const memory of memories) {
    const existing = await db
      .selectFrom("actor_memories",)
      .select("id",)
      .where("actor_id", "=", actorId,)
      .where("content", "=", memory.content,)
      .executeTakeFirst();

    if (existing) {
      continue;
    }

    await db
      .insertInto("actor_memories",)
      .values({
        id: randomUUID(),
        actor_id: actorId,
        content: memory.content,
        memory_type: memory.memoryType,
        confidence: memory.confidence,
        importance: memory.importance,
        keywords: JSON.stringify(memory.keywords,),
        source_chat_id: chatId,
        scope: "character",
        privacy: "shared",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },)
      .execute();

    stored++;
  }

  if (stored > 0) {
    getLog().info("Stored extracted memories", { actorId, chatId, count: stored, },);
  }

  return stored;
}

/**
 * Background extraction hook — call after generation completes.
 * Non-blocking: fires and forgets, errors are logged but don't propagate.
 */
export async function extractAndStoreMemories(
  db: Kysely<DB>,
  opts: ExtractionOpts,
): Promise<void> {
  try {
    const memories = await extractMemories(db, opts,);
    if (memories.length > 0) {
      await storeMemories(db, opts.actorId, opts.chatId, memories,);
    }
  } catch (error) {
    getLog().warn("Background extraction failed", { error: (error as Error).message, actorId: opts.actorId, },);
  }
}
