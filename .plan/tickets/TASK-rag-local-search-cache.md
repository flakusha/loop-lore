# TASK: Local Search Providers & Caches

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-rag-document-processing.md

## Summary

Implement local/offline search providers and caching layers for self-hosted loop-lore instances that cannot or prefer not to use external APIs.

## Motivation

Self-hosted users need:

- Offline capability when internet is unavailable
- Privacy-sensitive environments (no external API calls)
- Cost avoidance (no API key requirements)
- Low-latency repeated queries
- Air-gapped or on-premise deployments

## Design Principles

| Principle                | Implementation                                  |
| ------------------------ | ----------------------------------------------- |
| **Offline-First**        | Local providers work without internet           |
| **Cache Hierarchy**      | Memory → SQLite → disk for layered caching      |
| **Graceful Degradation** | Fall back to local when external providers fail |
| **Automatic Warming**    | Pre-cache popular/recent queries on startup     |
| **TTL-Based Expiry**     | Configurable cache lifetime per content type    |

## Scope

### Phase 1: Local Search Providers

- [ ] Create local search provider interface (`src/rag/search/local/provider.ts`)
  ```typescript
  export interface LocalSearchProvider extends SearchProvider {
    type: "local";
    indexQuery(query: string, results: SearchResult[],): Promise<void>;
    getIndexedCount(): Promise<number>;
    clearIndex(): Promise<void>;
  }
  ```

- [ ] Implement SQLite FTS5 provider (`src/rag/search/local/sqlite-search.ts`)
  - Full-text search over cached search results
  - SQLite FTS5 for fast keyword matching
  - Automatic indexing of fetched web results
  - BM25 ranking for relevance

- [ ] Implement local web crawler cache (`src/rag/search/local/crawler-cache.ts`)
  - Cache full page content from web fetches
  - Store as searchable documents in RAG pipeline
  - Re-crawl on configurable schedule
  - Respect robots.txt and rate limits

- [ ] Implement SearXNG local instance (`src/rag/search/local/searxng-local.ts`)
  - Docker-based SearXNG setup helper
  - Auto-configuration for loop-lore
  - Health monitoring and restart
  - Meta-search across local engines

### Phase 2: Cache Infrastructure

- [ ] Create cache layer interface (`src/rag/search/cache/interface.ts`)
  ```typescript
  export interface SearchCache {
    get(key: string,): Promise<CacheEntry | null>;
    set(key: string, entry: CacheEntry, ttlMs: number,): Promise<void>;
    delete(key: string,): Promise<void>;
    clear(): Promise<void>;
    size(): Promise<number>;
  }

  export interface CacheEntry {
    results: SearchResult[];
    query: string;
    provider: string;
    cachedAt: number;
    expiresAt: number;
    hitCount: number;
  }
  ```

- [ ] Implement memory cache (`src/rag/search/cache/memory.ts`)
  - LRU eviction policy
  - Fast in-process access
  - Configurable max size (default: 1000 entries)
  - Ideal for hot queries

- [ ] Implement SQLite cache (`src/rag/search/cache/sqlite.ts`)
  - Persistent across restarts
  - Indexed by query hash
  - TTL-based cleanup
  - Hit count tracking for popularity

- [ ] Implement disk cache (`src/rag/search/cache/disk.ts`)
  - File-based cache for large results
  - Gzip compression
  - Store in `data/cache/search/`
  - Useful for full page content

- [ ] Create cache chain (`src/rag/search/cache/chain.ts`)
  - Multi-layer cache: memory → SQLite → disk
  - Read-through on miss
  - Write-through on set
  - Configurable layer order

### Phase 3: Cache Management

- [ ] Add cache warming (`src/rag/search/cache/warming.ts`)
  - Pre-cache popular queries on startup
  - Scheduled re-caching of frequently accessed content
  - Configurable warming strategy

- [ ] Implement cache analytics (`src/rag/search/cache/analytics.ts`)
  - Hit/miss ratio tracking
  - Query frequency analysis
  - Cache size monitoring
  - Eviction statistics

- [ ] Create cache API (`GET /api/rag/search/cache`)
  ```typescript
  // Cache stats
  GET /api/rag/search/cache/stats
  // Clear cache
  DELETE /api/rag/search/cache
  // Clear specific provider cache
  DELETE /api/rag/search/cache/:provider
  // Warm cache
  POST /api/rag/search/cache/warm
  ```

- [ ] Add cache configuration UI (`src/frontend/alpine/search-cache.ts`)
  - Cache layer enable/disable
  - TTL configuration per provider
  - Cache size limits
  - Manual cache clear/warm buttons
  - Hit rate visualization

### Phase 4: Offline Mode

- [ ] Implement offline mode (`src/rag/search/offline.ts`)
  - Detect internet connectivity
  - Switch to local-only providers automatically
  - Queue queries for later execution
  - Notify user of offline status

- [ ] Add offline indicator to UI
  - Toast notification on connectivity change
  - Search results tagged with online/offline source
  - Graceful degradation messaging

## Files

- `src/rag/search/local/provider.ts` — local provider interface
- `src/rag/search/local/sqlite-search.ts` — SQLite FTS5 search
- `src/rag/search/local/crawler-cache.ts` — page content cache
- `src/rag/search/local/searxng-local.ts` — local SearXNG helper
- `src/rag/search/cache/interface.ts` — cache interface
- `src/rag/search/cache/memory.ts` — LRU memory cache
- `src/rag/search/cache/sqlite.ts` — SQLite persistent cache
- `src/rag/search/cache/disk.ts` — disk-based cache
- `src/rag/search/cache/chain.ts` — multi-layer cache
- `src/rag/search/cache/warming.ts` — cache warming
- `src/rag/search/cache/analytics.ts` — cache statistics
- `src/rag/search/cache/api.ts` — cache API routes
- `src/rag/search/offline.ts` — offline mode
- `src/frontend/alpine/search-cache.ts` — cache config UI

## Configuration

Add to `src/config/schema.ts`:

```typescript
export const searchCacheConfigSchema = Type.Object({
  memory: Type.Object({
    enabled: Type.Boolean({ default: true, },),
    maxEntries: Type.Number({ default: 1000, },),
    ttlMs: Type.Number({ default: 1800000, },), // 30 min
  },),
  sqlite: Type.Object({
    enabled: Type.Boolean({ default: true, },),
    ttlMs: Type.Number({ default: 86400000, },), // 24 hours
    maxEntries: Type.Number({ default: 10000, },),
  },),
  disk: Type.Object({
    enabled: Type.Boolean({ default: false, },),
    ttlMs: Type.Number({ default: 604800000, },), // 7 days
    maxSizeMb: Type.Number({ default: 500, },),
  },),
  warming: Type.Object({
    enabled: Type.Boolean({ default: true, },),
    onStartup: Type.Boolean({ default: true, },),
    scheduleMs: Type.Number({ default: 3600000, },), // 1 hour
    maxQueries: Type.Number({ default: 100, },),
  },),
  offline: Type.Object({
    enabled: Type.Boolean({ default: true, },),
    autoDetect: Type.Boolean({ default: true, },),
    fallbackToLocal: Type.Boolean({ default: true, },),
  },),
},);
```

## Dependencies

- Depends on: `TASK-rag-search-providers.md` (search provider interface)
- Depends on: `epic-rag-document-processing.md` (core RAG pipeline)
- Enables: Offline-capable RAG for air-gapped deployments

## Verification

```bash
# Check cache stats
curl http://localhost:3000/api/rag/search/cache/stats

# Warm cache with popular queries
curl -X POST http://localhost:3000/api/rag/search/cache/warm

# Clear provider cache
curl -X DELETE http://localhost:3000/api/rag/search/cache/brave

# Search (should hit cache on repeat)
curl -X POST http://localhost:3000/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "test query", "provider": "sqlite-local"}'

# Verify offline mode
# Disconnect internet, search should fall back to local providers
curl -X POST http://localhost:3000/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "cached results", "offline": true}'
```
