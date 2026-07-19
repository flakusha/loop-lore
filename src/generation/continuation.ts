/**
 * Continuation Management
 *
 * In-memory store for partial generation content preserved after cancel/fail.
 * Used by the Continue feature to resume partial/cancelled LLM output.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";

/** In-memory store for partial content preserved after cancel/fail */
const partialContentStore = new Map<string, string>();

/** Map of messageId → latest attemptId for quick lookup */
const messageToAttempt = new Map<string, string>();

/**
 * Get partial content for a generation attempt.
 * Checks in-memory store first, falls back to DB.
 *
 * @param attemptId — the generation attempt ID
 * @param db — Kysely DB instance for fallback lookup
 * @returns object with content string or null if not found
 */
export async function getPartialContent(
  attemptId: string,
  db: Kysely<DB>,
): Promise<{ content: string | null }> {
  const inMemory = partialContentStore.get(attemptId,);
  if (inMemory !== undefined) {
    return { content: inMemory, };
  }

  const attempt = await db
    .selectFrom("generation_attempts",)
    .select("partial_content",)
    .where("id", "=", attemptId,)
    .executeTakeFirst();

  if (attempt && attempt.partial_content !== null) {
    partialContentStore.set(attemptId, attempt.partial_content,);
    return { content: attempt.partial_content, };
  }

  return { content: null, };
}

/**
 * Store partial content for a generation attempt.
 * Preserves it across cancellation/failure for Continue feature.
 *
 * @param attemptId — the generation attempt ID
 * @param content — partial content to store
 */
export function storePartialContent(attemptId: string, content: string,): void {
  partialContentStore.set(attemptId, content,);
}

/**
 * Map a message ID to its latest generation attempt ID.
 * Used for rapid lookup when Continue targets a message.
 */
export function mapMessageToAttempt(messageId: string, attemptId: string,): void {
  messageToAttempt.set(messageId, attemptId,);
}

/**
 * Get the latest generation attempt ID for a message.
 */
export function getAttemptForMessage(messageId: string,): string | undefined {
  return messageToAttempt.get(messageId,);
}

/**
 * Clear all stored partial content (for testing / cleanup).
 */
export function clearPartialContent(): void {
  partialContentStore.clear();
  messageToAttempt.clear();
}
