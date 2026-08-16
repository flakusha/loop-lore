<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RAG Search Providers Integration

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Epic:** epic-rag-document-processing.md

## Summary

Integrate external web search providers (DuckDuckGo, SearXNG, Brave, Google, Bing, Tavily) to enable real-time web retrieval for RAG context enrichment and assistant deep research.

## Motivation

Document-only RAG is insufficient for:

- Real-time information (news, live data, current events)
- Research queries requiring broad web coverage
- Business intelligence and competitive analysis
- Fact-checking and source verification

## Design Principles

| Principle                | Implementation                                                              |
| ------------------------ | --------------------------------------------------------------------------- |
| **Provider Abstraction** | Unified `SearchProvider` interface; swap providers without code changes     |
| **Fallback Chains**      | Primary → secondary → tertiary provider on failure/rate-limit               |
| **Result Normalization** | All providers return normalized `SearchResult` shape                        |
| **Rate Limiting**        | Per-provider rate limit tracking and backoff                                |
| **Caching**              | Response cache to avoid redundant queries (see TASK-rag-local-search-cache) |
| **Cost Control**         | Token budget per query; truncate/summarize results before injection         |

## Scope

### Phase 1: Provider Abstraction & Core Providers

- [ ] Create search provider interface (`src/rag/search/provider.ts`)

  ```typescript
  export interface SearchProvider {
    name: string;
    type: "free" | "api-key" | "self-hosted";
    search(query: string, options: SearchOptions,): Promise<SearchResult[]>;
    isAvailable(): Promise<boolean>;
  }

  export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
    content?: string; // full page content (fetched separately)
    score: number;
    provider: string;
    metadata?: Record<string, unknown>;
  }

  export interface SearchOptions {
    maxResults: number;
    language?: string;
    region?: string;
    timeRange?: "day" | "week" | "month" | "year";
    safeSearch?: boolean;
  }
  ```

- [ ] Implement DuckDuckGo provider (`src/rag/search/providers/duckduckgo.ts`)
  - No API key required
  - Use DuckDuckGo HTML API or `duck-duck-scrape` pattern
  - Rate limit: ~20 req/min

- [ ] Implement SearXNG provider (`src/rag/search/providers/searxng.ts`)
  - Self-hosted meta-search engine
  - Configurable instance URL
  - JSON API output format
  - No rate limit (self-hosted)

- [ ] Implement Brave Search provider (`src/rag/search/providers/brave.ts`)
  - Requires API key (`BRAVE_API_KEY`)
  - Free tier: 2,000 queries/month
  - Web Search API v1

- [ ] Implement Google Custom Search provider (`src/rag/search/providers/google.ts`)
  - Requires API key + Search Engine ID
  - Free tier: 100 queries/day
  - Programmable Search Engine API

- [ ] Implement Bing Web Search provider (`src/rag/search/providers/bing.ts`)
  - Requires API key (`BING_API_KEY`)
  - Free tier: 1,000 queries/month
  - Web Search API v7

- [ ] Implement Tavily provider (`src/rag/search/providers/tavily.ts`)
  - Requires API key (`TAVILY_API_KEY`)
  - AI-optimized search results
  - Returns cleaned content snippets

### Phase 2: Provider Orchestration

- [ ] Create search orchestrator (`src/rag/search/orchestrator.ts`)
  - Provider priority/fallback chain
  - Parallel search across multiple providers
  - Result deduplication and ranking
  - Rate limit aware routing

- [ ] Add provider registry (`src/rag/search/registry.ts`)
  - Dynamic provider registration
  - Health checks and availability tracking
  - Configuration via `src/config/schema.ts`

- [ ] Implement search middleware (`src/rag/search/middleware.ts`)
  - Query preprocessing (expansion, reformulation)
  - Result postprocessing (filtering, scoring)
  - Token budget enforcement
  - Result truncation for context window

### Phase 3: Deep Research Pipeline

- [ ] Create deep research agent (`src/rag/search/research.ts`)
  - Multi-step research with query decomposition
  - Iterative search → fetch → extract → synthesize
  - Citation tracking across sources
  - Report generation with source attribution

- [ ] Add research API (`POST /api/rag/research`)

  ```json
  {
    "query": "What are the latest trends in AI agent frameworks?",
    "maxSteps": 5,
    "maxSources": 20,
    "providers": ["brave", "tavily"],
    "outputFormat": "report"
  }
  ```

- [ ] Implement research progress streaming (`GET /api/rag/research/:id/stream`)

### Phase 4: Integration with RAG Pipeline

- [ ] Extend `RAGRetrieval` to include web search results
- [ ] Add web search as context source in `ContextInjector`
- [ ] Create hybrid retrieval (local docs + web search)
- [ ] Add source type attribution (document vs web)
- [ ] Implement web result caching for repeated queries

## Files

- `src/rag/search/provider.ts` — provider interface
- `src/rag/search/providers/duckduckgo.ts` — DuckDuckGo
- `src/rag/search/providers/searxng.ts` — SearXNG
- `src/rag/search/providers/brave.ts` — Brave Search
- `src/rag/search/providers/google.ts` — Google Custom Search
- `src/rag/search/providers/bing.ts` — Bing Web Search
- `src/rag/search/providers/tavily.ts` — Tavily
- `src/rag/search/orchestrator.ts` — provider orchestration
- `src/rag/search/registry.ts` — provider registry
- `src/rag/search/middleware.ts` — query/result processing
- `src/rag/search/research.ts` — deep research pipeline
- `src/rag/search/api.ts` — search API routes
- `src/rag/search/cache.ts` — response caching (see TASK-rag-local-search-cache)

## Configuration

Add to `src/config/schema.ts`:

```typescript
export const searchConfigSchema = Type.Object({
  providers: Type.Array(Type.Object({
    name: Type.String(),
    type: Type.Union([Type.Literal("free",), Type.Literal("api-key",), Type.Literal("self-hosted",),],),
    enabled: Type.Boolean({ default: true, },),
    priority: Type.Number({ default: 0, },),
    apiKey: Type.Optional(Type.String(),), // encrypted
    baseUrl: Type.Optional(Type.String(),), // for self-hosted
    rateLimit: Type.Optional(Type.Object({
      requests: Type.Number(),
      windowMs: Type.Number(),
    },),),
  },),),
  defaultProvider: Type.String({ default: "duckduckgo", },),
  fallbackEnabled: Type.Boolean({ default: true, },),
  maxResultsPerQuery: Type.Number({ default: 10, },),
  cacheEnabled: Type.Boolean({ default: true, },),
  cacheTtlMs: Type.Number({ default: 3600000, },), // 1 hour
},);
```

## Dependencies

- Depends on: `epic-rag-document-processing.md` (core RAG pipeline)
- Depends on: `epic-byok-api-keys.md` (API key management)
- Depends on: `epic-encryption-foundation.md` (API key encryption)
- Enables: `TASK-rag-context-enrichment.md` (web context for enrichment)

## Verification

```bash
# Search via DuckDuckGo
curl -X POST http://localhost:3000/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "AI agent frameworks 2026", "provider": "duckduckgo", "maxResults": 5}'

# Search via Brave
curl -X POST http://localhost:3000/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "AI agent frameworks 2026", "provider": "brave", "maxResults": 5}'

# Multi-provider search
curl -X POST http://localhost:3000/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "AI agent frameworks 2026", "providers": ["brave", "tavily"], "maxResults": 10}'

# Deep research
curl -X POST http://localhost:3000/api/rag/research \
  -H "Content-Type: application/json" \
  -d '{"query": "Compare top 5 AI agent frameworks", "maxSteps": 3}'

# List available providers
curl http://localhost:3000/api/rag/search/providers
```
