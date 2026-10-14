// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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
 * Both maps are process-lifetime caches with no eviction path other than
 * `clearPartialContent`, so a long-running server grows them without bound.
 * Map iteration is insertion-ordered, so the first key is the oldest entry.
 */
const MAX_CACHED_ENTRIES = 1000;

/**
 * Set an entry, evicting the oldest entries once the cache exceeds the cap.
 * @param store - the cache map
 * @param key - entry key
 * @param value - entry value
 * @returns {void}
 */
function setBounded(store: Map<string, string>, key: string, value: string,): void {
  store.delete(key,);
  store.set(key, value,);
  while (store.size > MAX_CACHED_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) { break; }
    store.delete(oldest,);
  }
}

/**
 * Get partial content for a generation attempt.
 * Checks in-memory store first, falls back to DB.
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
    setBounded(partialContentStore, attemptId, attempt.partial_content,);
    return { content: attempt.partial_content, };
  }

  return { content: null, };
}

/**
 * Store partial content for a generation attempt.
 * Preserves it across cancellation/failure for Continue feature.
 * @param attemptId — the generation attempt ID
 * @param content — partial content to store
 * @returns {void}
 */
export function storePartialContent(attemptId: string, content: string,): void {
  setBounded(partialContentStore, attemptId, content,);
}

/**
 * Map a message ID to its latest generation attempt ID.
 * Used for rapid lookup when Continue targets a message.
 * @param messageId
 * @param attemptId
 * @returns {void}
 */
export function mapMessageToAttempt(messageId: string, attemptId: string,): void {
  setBounded(messageToAttempt, messageId, attemptId,);
}

/**
 * Get the latest generation attempt ID for a message.
 * @param messageId
 * @returns {string | undefined}
 */
export function getAttemptForMessage(messageId: string,): string | undefined {
  return messageToAttempt.get(messageId,);
}

/**
 * Clear all stored partial content (for testing / cleanup).
 * @returns {void}
 */
export function clearPartialContent(): void {
  partialContentStore.clear();
  messageToAttempt.clear();
}
