// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unified search service — mode dispatch + RRF fusion + time caps.
 *
 * DB-free by design: tiers arrive as injected {@link TierProvider}s so the
 * service is unit-testable and reusable from routes, the assistant, and
 * chat context injection. Route layers wire the real providers:
 * FTS5 keyword (`src/routes/message-search/helpers.ts:buildFtsQuery`),
 * vector (`src/memory/embeddings.ts:rankBySimilarity`), fuzzy gallery
 * (`fuzzyScore` in `./rank`), token (`deriveSearchTokens` in
 * `./encrypted-tokens` + the pending `message_search_tokens` table).
 */
import { resolveTimeCap, type SearchTimeCapConfig, } from "./config";
import { reciprocalRankFusion, } from "./rank";
import {
  type SearchHit,
  type SearchOpts,
  type SearchQuery,
  type SearchScope,
  SearchTimeoutError,
  type TierProvider,
} from "./types";

/** Tier providers per mode. `hybrid` composes keyword + vector (+ token when opted in). */
export interface ServiceProviders {
  /** Direct DB lookup. Falls back to keyword; absent entirely → no hits. */
  exact?: TierProvider;
  /** FTS5 BM25. */
  keyword?: TierProvider;
  /** Trigram/Levenshtein/fuzzyScore baseline. Falls back to keyword. */
  fuzzy?: TierProvider;
  /** Cosine over stored embeddings. */
  vector?: TierProvider;
  /** Ciphertext-token match. Only runs when callers pass `includeEncrypted`. */
  token?: TierProvider;
}

/** Options for {@link createUnifiedSearchService}. */
export interface ServiceOptions {
  /** Tier providers to dispatch to. */
  providers: ServiceProviders;
  /** 3-tier time-cap ladder (user > admin > global). */
  timeCaps: SearchTimeCapConfig;
}

/** Unified search handle: one `search` entry point over every tier. */
export interface UnifiedSearchService {
  /**
   * Run one search query against a scope.
   * @param query - query + mode + paging
   * @param scope - messages/memories/assets/characters/lore (authz enforced by providers)
   * @param callOpts - per-call overrides (timeoutMs)
   * @returns ranked hits, highest score first
   * @throws SearchTimeoutError with partial hits when the cap is exceeded
   */
  search(query: SearchQuery, scope: SearchScope, callOpts?: SearchOpts,): Promise<SearchHit[]>;
}

/**
 * Create a unified search service from injected tier providers.
 * @param opts - providers + time-cap config
 * @returns service with a single `search` entry point
 * @example
 * ```ts
 * const svc = createUnifiedSearchService({ providers: { keyword, vector }, timeCaps });
 * await svc.search({ q: "tavern", mode: "hybrid", topK: 10 }, { kind: "messages", userId });
 * ```
 */
export function createUnifiedSearchService(opts: ServiceOptions,): UnifiedSearchService {
  const { providers, timeCaps, } = opts;

  async function search(
    query: SearchQuery,
    scope: SearchScope,
    callOpts?: SearchOpts,
  ): Promise<SearchHit[]> {
    const q = query.q.trim();
    if (!q) { return []; }
    const topK = query.topK ?? 20;
    const resolved = resolveTimeCap(timeCaps,);
    const timeoutMs = callOpts?.timeoutMs ?? resolved.defaultMs;
    // Filled incrementally as tiers settle; the timeout error carries it.
    const partial: SearchHit[] = [];
    const normalized: SearchQuery = { ...query, q, };

    const run = async (): Promise<SearchHit[]> => {
      const tiers = tiersFor(query.mode, providers, query.includeEncrypted === true,);
      const lists = await runTierLists(tiers, normalized, scope, partial,);
      if (query.mode === "hybrid") { return reciprocalRankFusion(lists, topK,); }
      return applyFloor(lists.flat(), query.minScore, topK,);
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject,) => {
        timer = setTimeout(() => reject(new SearchTimeoutError(timeoutMs, [...partial,],),), timeoutMs,);
      },);
      const hits = await Promise.race([run(), timeout,],);
      return applyFloor(hits, query.minScore, topK,);
    } finally {
      clearTimeout(timer,);
    }
  }

  return { search, };
}

/**
 * Pick tier providers for a mode.
 * @param mode - search tier
 * @param providers - wired providers
 * @param includeEncrypted - whether to add the token tier to hybrid
 * @returns providers to fan out to, in rank-priority order
 * @throws Error on unknown mode (exhaustiveness guard)
 */
function tiersFor(
  mode: SearchQuery["mode"],
  providers: ServiceProviders,
  includeEncrypted: boolean,
): TierProvider[] {
  switch (mode) {
    case "exact": {
      const tier = providers.exact ?? providers.keyword;
      return tier === undefined ? [] : [tier,];
    }
    case "keyword":
    case "fuzzy":
    case "vector": {
      const tier = providers[mode] ?? providers.keyword;
      return tier === undefined ? [] : [tier,];
    }
    case "hybrid": {
      const tiers = [providers.keyword, providers.vector,].filter((t,) => t !== undefined);
      if (includeEncrypted && providers.token !== undefined) { tiers.push(providers.token,); }
      return tiers;
    }
    default: {
      const exhaustive: never = mode;
      throw new Error(`unhandled search mode: ${String(exhaustive,)}`,);
    }
  }
}

async function runTierLists(
  tiers: TierProvider[],
  query: SearchQuery,
  scope: SearchScope,
  partial: SearchHit[],
): Promise<SearchHit[][]> {
  const wrapped = tiers.map((t,) =>
    t(query, scope,).then((hits,) => {
      partial.push(...hits,);
      return hits;
    },)
  );
  const settled = await Promise.allSettled(wrapped,);
  const lists: SearchHit[][] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") { lists.push(s.value,); }
  }
  return lists;
}

function applyFloor(hits: SearchHit[], minScore: number | undefined, topK: number,): SearchHit[] {
  const floor = minScore ?? 0;
  return hits
    .filter((h,) => h.score >= floor)
    .sort((a, b,) => b.score - a.score)
    .slice(0, topK,);
}
