<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RAG Internet Search — robots.txt, Retry, Rate Limits, Public/Private Split

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Type:** Feature Task (RAG external)
**Tags:** rag, internet-search, search-providers, robots-txt, retry, rate-limit, paid-api, free-api, public-cache, private-cache
**Epic:** epic-rag-context-sources.md (extends `TASK-rag-search-providers.md`), epic-api-rate-limiting

## Summary

Implement the **operational correctness** of internet-search-backed RAG: per-host robots.txt cache (24h TTL, `crawl-delay` respected, disallowed paths refused), correct retry logic (exponential backoff with jitter, max retries per provider), correct rate-limit enforcement (per-provider, per-user), and **public/private result split** via a shared cache + ACL (decision 2026-09-07). Closes the gaps in `TASK-rag-search-providers.md` (which lists providers but does not specify robots/visibility/retry correctness).

## Why this task exists (the gap)

`TASK-rag-search-providers.md` (existing, status ⬜) lists 6 providers and an orchestrator. It does **not** cover:

1. **robots.txt compliance** — required for self-hosted/SearXNG/scrape paths and respectful crawling
2. **Retry correctness** — exponential backoff + jitter; honour provider `Retry-After` headers
3. **Rate-limit enforcement** — per-provider token bucket; per-user quota
4. **Public vs private cache split** — user explicitly asked: "results are saved compressed and private/public, depending on preference - the public results may resurface in consequent searches, private results are stored solely for the user"
5. **Free vs paid API cost control** — token budget per query; truncate results before injection

## Design

### robots.txt compliance

```ts
// src/rag/search/robots.ts
export interface RobotsPolicy {
  host: string;
  fetchedAt: number;
  ttlMs: number;            // 24h default
  disallowedPaths: string[];
  crawlDelayMs?: number;
  raw: string;              // for debugging
}

export async function getRobotsPolicy(host: string, fetcher?: typeof fetch): Promise<RobotsPolicy>;
export async function isPathAllowed(policy: RobotsPolicy, path: string): Promise<boolean>;
```

- Cache stored in `search_robots_cache(host, fetched_at, policy_json)` (new table)
- 24h TTL; manual invalidation endpoint for admins
- `crawl-delay` parsed into min interval between requests to the same host
- Disallowed paths refused at the search-result-fetch stage (not at the search-query stage — providers filter internally)
- **Strict mode** per user decision 2026-09-07

### Retry correctness

```ts
// src/rag/search/retry.ts
export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Backoff with jitter (full jitter by default). */
  jitter: "none" | "full" | "equal";
  /** Honour provider Retry-After header when present. */
  honourRetryAfter: boolean;
  /** HTTP status codes that trigger retry. */
  retryableStatuses: number[];   // default [429, 500, 502, 503, 504]
  /** Statuses that fail fast (no retry). */
  failFastStatuses: number[];    // default [400, 401, 403, 404]
}
```

- Exponential backoff: `delay = min(maxDelay, base * 2^attempt) * jitter`
- Retryable errors only; non-retryable throw immediately
- `Retry-After` header (numeric or HTTP-date) takes precedence over computed backoff
- Per-provider override in config (e.g. Tavily allows 3 retries, DuckDuckGo allows 1)

### Rate-limit enforcement

```ts
// src/rag/search/rate-limit.ts
export interface RateLimitState {
  provider: string;
  windowMs: number;
  maxRequests: number;
  remaining: number;
  resetAt: number;
}

export interface RateLimiter {
  /** Reserve a request slot or throw `RateLimitedError`. */
  reserve(provider: string, cost?: number): Promise<RateLimitState>;
  /** Record a 429 response and roll back the reservation. */
  recordRateLimited(provider: string): Promise<void>;
  /** Read current state without reserving. */
  peek(provider: string): Promise<RateLimitState>;
}
```

- Per-provider sliding window
- Per-user second-order limit (e.g. user may issue 10 searches/min regardless of provider)
- 429 response → `recordRateLimited` + automatic `Retry-After` enforcement
- Admin endpoint to inspect current state per provider

### Public/private result split

```ts
// src/rag/search/visibility.ts
export type Visibility = "public" | "private";

export interface CachedSearchResult {
  id: string;
  queryHash: string;
  provider: string;
  visibility: Visibility;
  ownerId?: string;        // null when visibility=public
  results: SearchResult[];
  contentBlob: Buffer;     // gzip-compressed
  createdAt: number;
  ttlAt: number;
}
```

- Single `search_results_cache` table; rows carry `visibility` + `owner_id`
- Public rows visible to all users; private rows only to `ownerId`
- Admin sets default per-query; user can override per-query (`?visibility=private`)
- **Stored compressed** (gzip) — content blob is gzip-compressed JSON
- ACL enforced at the read path (`can(user, 'search.read', { ownerId, visibility })`)

### Free vs paid API cost control

```ts
// src/rag/search/budget.ts
export interface SearchBudget {
  /** Max results per query (server default 10). */
  maxResults: number;
  /** Token budget per query (truncate/summarize results before injection). */
  tokenBudget: number;
  /** Cost ceiling per query (USD; provider-dependent). */
  costCeilingUsd?: number;
}
```

- Admin sets per-provider cost ceiling
- Truncation strategy: keep top-K by score, then summarize if still over budget (aux-LLM)
- Free providers (DDG/SearXNG) have no cost ceiling; paid providers (Tavily/Brave/Google/Bing) do

## Files

- `src/rag/search/robots.ts` — `getRobotsPolicy`, `isPathAllowed`
- `src/rag/search/retry.ts` — `withRetry` wrapper, `RetryPolicy`
- `src/rag/search/rate-limit.ts` — `RateLimiter`, sliding window
- `src/rag/search/visibility.ts` — `CachedSearchResult`, ACL
- `src/rag/search/budget.ts` — `SearchBudget`, truncation
- `src/rag/search/orchestrator.ts` — wires robots → retry → rate-limit → visibility into existing providers
- `src/db/migrations/parts/NNN_search_infra.ts` — `search_robots_cache`, `search_results_cache`, `search_rate_limit_state` tables
- `src/config/schema.ts` — extend search provider config with retry + rate-limit + cost ceiling
- `src/routes/admin/search-providers.ts` — admin endpoints (list providers, reset rate-limit state, invalidate robots cache)
- `src/routes/rag/search.ts` — extend `POST /api/rag/search` with `visibility`, `compress: true`
- Tests: each module unit-tested; orchestrator integration-tested

## Acceptance Criteria

- [ ] robots.txt cached per host with 24h TTL; disallowed paths refused
- [ ] `crawl-delay` enforced as minimum interval between requests to same host
- [ ] Retry uses exponential backoff + jitter; honours `Retry-After`; non-retryable fails fast
- [ ] Rate-limit per-provider (sliding window) + per-user secondary limit
- [ ] 429 response rolls back reservation + auto-waits `Retry-After`
- [ ] Public rows readable by all; private rows only by ownerId (ACL enforced)
- [ ] Results stored gzip-compressed; storage size reduced ≥ 60%
- [ ] Cost ceiling per paid provider; truncation/summarization when exceeded
- [ ] Admin can list providers, reset rate-limit, invalidate robots cache
- [ ] No new tables alter existing schema (append-only)

## Dependencies

- Builds on: `TASK-rag-search-providers.md` (provider list, orchestrator)
- Builds on: `TASK-rag-local-search-cache.md` (cache pattern)
- Bridges: `TASK-rag-context-enrichment.md` (cache shared with feed/email/chat sources)
- Bridges: `epic-encryption-foundation.md` (private cache entries may carry user-keyed encryption)
- Schema strategy: **append new migration part**
