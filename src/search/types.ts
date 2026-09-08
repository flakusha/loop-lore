// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unified search — shared vocabulary for every search surface.
 *
 * One umbrella (`src/search/`) for the five search tiers:
 * exact (DB-direct) → keyword (FTS5 BM25) → fuzzy (trigram/Levenshtein) →
 * vector (cosine) → hybrid (RRF fusion). Backend routes and `src/frontend/`
 * surfaces share these types plus the pure helpers in `rank.ts`/`config.ts`.
 *
 * NOTE: `src/rag/search/` is unrelated — it orchestrates external web-search
 * providers (captcha/quarantine/fallback). Do not merge the two.
 */

/** Search tier. Ordered cheapest → most expensive. */
export type SearchMode = "exact" | "keyword" | "fuzzy" | "vector" | "hybrid";

/** Where a search is allowed to look. Scopes carry their own authz. */
export type SearchScope =
  | { kind: "messages"; chatId?: string; userId: string; isAdmin?: boolean }
  | { kind: "memories"; actorId: string }
  | { kind: "assets"; userId: string; visibility?: "public" | "private" | "shared"; isAdmin?: boolean }
  | { kind: "characters"; userId: string }
  | { kind: "lore"; worldId?: string };

/** A single search request. */
export interface SearchQuery {
  /** Raw user input; providers tokenize/normalize per mode. */
  q: string;
  /** Tier to run. `hybrid` fans out to keyword + vector (+ token when opted in). */
  mode: SearchMode;
  /** Max hits to return. Defaults to 20. */
  topK?: number;
  /** Minimum score in [0, 1]; hits below are dropped. */
  minScore?: number;
  /** Provider-specific filters (role, date range, attachment type, …). */
  filters?: Record<string, unknown>;
  /** Opt-in to ciphertext-token matching over client-pre-encrypted rows. */
  includeEncrypted?: boolean;
}

/** One ranked hit. */
export interface SearchHit<T = unknown,> {
  /** Row id in the owning table. */
  id: string;
  /** Normalized score in [0, 1]; higher is better. */
  score: number;
  /** Which tier produced this hit. */
  source: "db" | "fts" | "fuzzy" | "vector" | "token" | "fused";
  /** Owning-table payload (message, memory, asset, …). */
  payload: T;
  /** True when matched only via HMAC token on an encrypted row. */
  encryptedMatch?: boolean;
}

/** Per-call overrides for {@link createUnifiedSearchService} providers. */
export interface SearchOpts {
  /** Hard cap for this call; overrides resolved tier config. */
  timeoutMs?: number;
}

/**
 * A tier provider: runs one mode against one scope, returns ranked hits.
 * Providers MUST enforce scope authz themselves (chat access, visibility).
 */
export interface TierProvider<T = unknown,> {
  (query: SearchQuery, scope: SearchScope,): Promise<SearchHit<T>[]>;
}

/**
 * Thrown when a query exceeds its time cap. `partial` holds whatever tier
 * results completed before the abort so callers can render degraded output.
 */
export class SearchTimeoutError extends Error {
  /** Hits collected before the abort; possibly empty. */
  readonly partial: SearchHit[];

  /**
   * @param timeoutMs - cap that was exceeded
   * @param partial - hits collected before the abort
   */
  constructor(timeoutMs: number, partial: SearchHit[] = [],) {
    super(`search exceeded time cap of ${timeoutMs}ms (${partial.length} partial hits)`,);
    this.name = "SearchTimeoutError";
    this.partial = partial;
  }
}
