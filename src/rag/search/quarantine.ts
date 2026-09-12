// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Search-provider quarantine — one `CircuitBreaker` instance per search
 * provider, separate from the LLM generation breaker.
 *
 * Captcha → long quarantine (default 15 min). Rate-limit → short
 * cooldown from `Retry-After` (default 30s cap 5 min). Half-open probe
 * re-admits after cooldown expiry.
 *
 * Also hosts `excludeArchivedChats` for the RAG recall layer (TASK-chat-feature-archive-deletion-search):
 * archived chats must not surface in recall by default. Keeping the helper here
 * colocates every "take this OUT of the search pool" code path in one file.
 */

import type { Kysely, } from "kysely";
import { PinnedState, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { CircuitBreaker, } from "../../generation/providers/circuit-breaker";
import { CaptchaBlockedError, ProviderRateLimitedError, } from "./errors";

/** Default quarantine after a captcha block (15 min). */
export const DEFAULT_CAPTCHA_QUARANTINE_MS = 15 * 60_000;
/** Fallback cooldown for rate-limits without `Retry-After` (30s). */
export const DEFAULT_RATELIMIT_COOLDOWN_MS = 30_000;

/** Search-scoped breaker: thresholds tuned for bursty scrape paths. */
export const searchBreaker = new CircuitBreaker();

function ensure(provider: string,): void {
  searchBreaker.register(provider, { threshold: 1, baseCooldownMs: 30_000, maxCooldownMs: 3_600_000, },);
}

/**
 * Record a captcha block and open a long quarantine.
 * @param provider - Blocked provider
 * @param quarantineMs - Quarantine duration
 */
export function quarantineOnCaptcha(provider: string, quarantineMs: number = DEFAULT_CAPTCHA_QUARANTINE_MS,): void {
  ensure(provider,);
  // Threshold 1 → single onFailure opens the circuit; Retry-After-equivalent
  // slot carries the long quarantine duration.
  searchBreaker.onFailure(provider, quarantineMs,);
}

/**
 * Record a rate-limit with server-directed cooldown.
 * @param provider - Limited provider
 * @param retryAfterMs - Cooldown from header or backoff
 */
export function quarantineOnRateLimit(
  provider: string,
  retryAfterMs: number = DEFAULT_RATELIMIT_COOLDOWN_MS,
): void {
  ensure(provider,);
  searchBreaker.onFailure(provider, retryAfterMs,);
}

/**
 * Whether a provider may receive a search request now.
 * @param provider - Provider name
 */
export function maySearch(provider: string,): boolean {
  return searchBreaker.allowRequest(provider,);
}

/**
 * Re-throw helper: captcha errors quarantine as a side effect.
 * @param error
 */
export function trackSearchError(error: unknown,): never {
  if (error instanceof CaptchaBlockedError) {
    quarantineOnCaptcha(error.provider, error.quarantineMs,);
  } else if (error instanceof ProviderRateLimitedError) {
    quarantineOnRateLimit(error.provider, error.retryAfterMs,);
  }
  throw error;
}

/**
 * Filter archived chats out of a candidate id list for RAG recall.
 *
 * Archived chats (`is_pinned = "archived"`) are hidden from default listings
 * and must not surface in RAG recall by default. Callers (the recall orchestrator
 * and any chat-search route that feeds the recall layer) feed the candidate
 * id set; this helper returns the subset that survives the archive filter.
 *
 * `includeArchived = true` is the explicit opt-in for the archived view
 * (`include_archived` query param on `GET /api/chats/search`).
 *
 * Single batch query — one `IN` plus a `NOT IN (archived-set)` predicate.
 * Empty / unknown ids fall through unchanged so callers can pass the result
 * of an upstream `SELECT id` without a NULL guard.
 * @param database
 * @param chatIds Candidate chat ids to filter
 * @param includeArchived When true, return the original set unchanged
 */
export async function excludeArchivedChats(
  database: Kysely<DB>,
  chatIds: string[],
  includeArchived = false,
): Promise<string[]> {
  if (includeArchived) { return chatIds; }
  if (chatIds.length === 0) { return []; }
  const archived = await database
    .selectFrom("chats",)
    .select("id",)
    .where("id", "in", chatIds,)
    .where("is_pinned", "=", PinnedState.Archived,)
    .execute();
  if (archived.length === 0) { return chatIds; }
  const blocked = new Set<string>();
  for (const row of archived) { blocked.add(row.id,); }
  const live: string[] = [];
  for (const id of chatIds) { if (!blocked.has(id,)) { live.push(id,); } }
  return live;
}
