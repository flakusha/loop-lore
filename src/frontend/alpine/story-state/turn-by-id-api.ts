// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story turn by-id lookup (GET /api/v1/chats/:chatId/story-turns/:turnId)
 * with a client-side cache keyed per (chatId, turnId).
 *
 * The detail view deep-links into a specific turn; re-opening the same turn
 * must not re-fetch, so resolved turns are memoized module-level. The cache
 * is process-lifetime (single page session) and exportable for tests.
 */

import { apiFetch, } from "../htmx";
import type { StoryTurnDetail, } from "./types";

/** Resolved turns keyed `"<chatId>:<turnId>"`. */
const turnCache = new Map<string, StoryTurnDetail>();

/**
 * Build the composite cache key for a (chatId, turnId) pair.
 * @param chatId
 * @param turnId
 */
function cacheKey(chatId: string, turnId: string,): string {
  return `${chatId}:${turnId}`;
}

/**
 * Fetch a story turn by id, serving repeats from the client-side cache.
 * @param chatId
 * @param turnId
 * @returns {Promise<StoryTurnDetail | null>} null on failure or not-found
 */
export async function fetchStoryTurnById(
  chatId: string,
  turnId: string,
): Promise<StoryTurnDetail | null> {
  const key = cacheKey(chatId, turnId,);
  const cached = turnCache.get(key,);
  if (cached) { return cached; }

  try {
    const res = await apiFetch(`/api/v1/chats/${chatId}/story-turns/${turnId}`,);
    if (!res.ok) { return null; }
    const turn = await res.json() as StoryTurnDetail;
    turnCache.set(key, turn,);
    return turn;
  } catch {
    return null;
  }
}

/**
 * Drop all cached turn lookups (used by tests and chat switches).
 * @returns {void}
 */
export function clearStoryTurnCache(): void {
  turnCache.clear();
}

/**
 * Number of entries currently cached (test visibility).
 * @returns {number}
 */
export function storyTurnCacheSize(): number {
  return turnCache.size;
}
