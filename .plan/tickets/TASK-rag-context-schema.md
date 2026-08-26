<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-rag-context-schema: RAG shared context-source schema + sync framework

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** TASK
**Tags:** rag, schema, ingestion
**Epic:** epic-rag-document-processing.md
**Parent:** TASK-rag-context-enrichment (umbrella)

## Summary

Create the unified `ContextSource` provider interface plus the `context_sources` / `context_source_items` database schema and incremental-sync framework that every RAG source integration builds on.

## Design Principles (shared with all source children)

| Principle                 | Implementation                                         |
| ------------------------- | ------------------------------------------------------ |
| **Source Abstraction**    | Unified `ContextSource` interface for all integrations |
| **Incremental Ingestion** | Delta updates, not full re-indexing                    |
| **Access Scoping**        | Respect source permissions and access controls         |
| **Freshness Tracking**    | Metadata on when content was last updated              |
| **Lazy vs Eager**         | Configurable: fetch on query vs. pre-fetch schedule    |

## Tasks

- [ ] Create context source interface (`src/rag/sources/provider.ts`):

```typescript
export interface ContextSource {
  name: string;
  type: "feed" | "email" | "chat" | "database" | "api" | "knowledge-graph";
  ingest(options: IngestOptions,): Promise<IngestResult>;
  search(query: string, options: SearchOptions,): Promise<SearchResult[]>;
  getLastSynced(): Promise<Date | null>;
  healthCheck(): Promise<boolean>;
}

export interface IngestResult {
  sourceId: string;
  itemsIngested: number;
  itemsSkipped: number;
  errors: string[];
  syncDuration: number;
}
```

- [ ] Create `context_sources` table:

```sql
CREATE TABLE context_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,  -- feed, email, chat, database, api, knowledge-graph
  config JSONB NOT NULL,  -- provider-specific config (encrypted)
  enabled BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 0,
  last_synced_at DATETIME,
  sync_interval_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

- [ ] Create `context_source_items` table:

```sql
CREATE TABLE context_source_items (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES context_sources(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,  -- ID from source system
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  url TEXT,
  author TEXT,
  published_at DATETIME,
  ingested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB,
  embedding_id TEXT,  -- vector store reference
  UNIQUE(source_id, external_id)
);
```

- [ ] Incremental sync framework: delta updates keyed off `last_synced_at` + `sync_interval_ms`; scheduled + manual sync entry points; per-source health checks.
- [ ] Register the enrichment config schema in `src/config/schema.ts` (per-provider blocks below land with their owning children):

```typescript
export const enrichmentConfigSchema = Type.Object({
  feeds: Type.Object({
    enabled: Type.Boolean({ default: false, },),
    syncIntervalMs: Type.Number({ default: 3600000, },),
    maxFeeds: Type.Number({ default: 50, },),
  },),
  email: Type.Object({
    enabled: Type.Boolean({ default: false, },),
    imapHost: Type.Optional(Type.String(),),
    imapPort: Type.Optional(Type.Number(),),
    username: Type.Optional(Type.String(),),
    password: Type.Optional(Type.String(),), // encrypted
    folders: Type.Array(Type.String(),),
  },),
  chat: Type.Object({
    enabled: Type.Boolean({ default: false, },),
    providers: Type.Array(Type.Object({
      type: Type.Union([Type.Literal("slack",), Type.Literal("discord",), Type.Literal("matrix",),],),
      token: Type.String(), // encrypted
      channels: Type.Array(Type.String(),),
    },),),
  },),
  knowledgeGraph: Type.Object({
    enabled: Type.Boolean({ default: false, },),
    autoExtract: Type.Boolean({ default: true, },),
    entityTypes: Type.Array(Type.String(),),
    maxEntities: Type.Number({ default: 10000, },),
  },),
  enrichment: Type.Object({
    tokenBudget: Type.Number({ default: 4000, },),
    sourcePriority: Type.Array(Type.String(),),
    parallelQuery: Type.Boolean({ default: true, },),
  },),
},);
```

- [ ] `GET /api/rag/sources` — list all registered sources (shared listing endpoint).

## Files

- `src/rag/sources/provider.ts` — context source interface
- `src/db/` migrations for `context_sources`, `context_source_items`
- `src/config/schema.ts` — `enrichmentConfigSchema`

## Dependencies

- Depends on: `epic-rag-document-processing.md` (core RAG pipeline), `TASK-rag-search-providers.md` (search provider interface), `epic-byok-api-keys.md` (API key management), `epic-encryption-foundation.md` (credential encryption).
- Parent hub: `TASK-rag-context-enrichment.md`
- **Execute first** — all source siblings implement this interface; TASK-rag-unified-enrichment queries through it.

## Acceptance Criteria

- [ ] Interface + tables migrated; downstream schema artifacts regenerated
- [ ] A reference in-memory source can ingest/search through the framework
- [ ] Config schema validates; encrypted config storage wired to credential encryption
