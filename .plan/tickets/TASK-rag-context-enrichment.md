<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RAG Context Enrichment Integrations

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Epic:** epic-rag-document-processing.md

## Summary

Integrate additional context sources beyond documents and web search: RSS feeds, email, Slack/Discord, databases, APIs, and knowledge graphs for comprehensive RAG context enrichment.

## Motivation

Rich context requires diverse sources:

- **RSS/Atom feeds** — news, blogs, industry updates
- **Email** — support tickets, internal communications
- **Team chat** — Slack/Discord conversations for institutional knowledge
- **Databases** — structured data queries for factual context
- **APIs** — third-party data sources (CRM, project management)
- **Knowledge graphs** — entity relationships and semantic connections

## Design Principles

| Principle                 | Implementation                                         |
| ------------------------- | ------------------------------------------------------ |
| **Source Abstraction**    | Unified `ContextSource` interface for all integrations |
| **Incremental Ingestion** | Delta updates, not full re-indexing                    |
| **Access Scoping**        | Respect source permissions and access controls         |
| **Freshness Tracking**    | Metadata on when content was last updated              |
| **Lazy vs Eager**         | Configurable: fetch on query vs. pre-fetch schedule    |

## Scope

### Phase 1: Feed Sources (RSS/Atom)

- [ ] Create context source interface (`src/rag/sources/provider.ts`)

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

- [ ] Implement RSS/Atom feed provider (`src/rag/sources/feed/rss.ts`)
  - Parse RSS 2.0 and Atom feeds
  - Incremental sync (only new items since last fetch)
  - Content extraction from feed entries
  - Full article fetch option (follow links)
  - Feed discovery from URLs

- [ ] Implement feed manager (`src/rag/sources/feed/manager.ts`)
  - Add/remove/manage feeds
  - Schedule periodic sync
  - Feed health monitoring
  - Category/tag organization

- [ ] Add feed API (`/api/rag/sources/feeds`)

  ```typescript
  POST /api/rag/sources/feeds          // Add feed
  GET  /api/rag/sources/feeds          // List feeds
  DELETE /api/rag/sources/feeds/:id    // Remove feed
  POST /api/rag/sources/feeds/:id/sync // Manual sync
  GET  /api/rag/sources/feeds/:id/items // List items
  ```

### Phase 2: Email Integration

- [ ] Implement email provider (`src/rag/sources/email/imap.ts`)
  - IMAP connection for email retrieval
  - Configurable folder/label selection
  - Attachment extraction (PDF, DOCX)
  - Search across email content

- [ ] Add email ingestion options

  ```typescript
  export interface EmailIngestOptions {
    folders: string[]; // INBOX, Support, etc.
    since?: Date; // Only recent emails
    maxAge?: number; // Days to look back
    includeAttachments: boolean;
    excludePatterns?: string[]; // Regex patterns to skip
  }
  ```

- [ ] Create email API (`/api/rag/sources/email`)

  ```typescript
  POST / api / rag / sources / email / connect; // Configure IMAP
  GET / api / rag / sources / email / status; // Connection status
  POST / api / rag / sources / email / sync; // Trigger sync
  GET / api / rag / sources / email / search; // Search emails
  ```

### Phase 3: Team Chat Integration

- [ ] Implement Slack provider (`src/rag/sources/chat/slack.ts`)
  - Slack Web API integration
  - Channel message history ingestion
  - Thread context preservation
  - File/attachment extraction
  - Search across messages

- [ ] Implement Discord provider (`src/rag/sources/chat/discord.ts`)
  - Discord bot or webhook integration
  - Channel message history
  - Thread context
  - Forum post ingestion

- [ ] Implement Matrix provider (`src/rag/sources/chat/matrix.ts`)
  - Matrix client API integration
  - Room message history
  - Space-based organization

- [ ] Create unified chat API (`/api/rag/sources/chat`)

  ```typescript
  POST / api / rag / sources / chat / connect; // Configure provider
  GET / api / rag / sources / chat / channels; // List channels
  POST / api / rag / sources / chat / ingest; // Ingest channel history
  GET / api / rag / sources / chat / search; // Search messages
  ```

### Phase 4: Database & API Sources

- [ ] Implement database provider (`src/rag/sources/database/query.ts`)
  - SQL query execution against external databases
  - Schema introspection for context
  - Result-to-document conversion
  - Configurable query templates

- [ ] Implement REST API provider (`src/rag/sources/api/rest.ts`)
  - Generic REST endpoint integration
  - Authentication (API key, OAuth, Bearer)
  - Response-to-document conversion
  - Pagination handling

- [ ] Implement webhook receiver (`src/rag/sources/api/webhook.ts`)
  - Ingest data from external webhooks
  - Configurable payload parsing
  - Real-time ingestion on webhook fire

### Phase 5: Knowledge Graph

- [ ] Implement knowledge graph provider (`src/rag/sources/knowledge-graph/index.ts`)
  - Entity extraction from documents
  - Relationship mapping
  - Graph storage (SQLite-based)
  - Semantic traversal for context

- [ ] Add entity types

  ```typescript
  export type EntityType =
    | "person"
    | "organization"
    | "location"
    | "concept"
    | "event"
    | "document"
    | "custom";

  export interface Entity {
    id: string;
    type: EntityType;
    name: string;
    aliases: string[];
    metadata: Record<string, unknown>;
    embedding?: number[];
  }

  export interface Relationship {
    source: string;
    target: string;
    type: string;
    weight: number;
    metadata: Record<string, unknown>;
  }
  ```

- [ ] Create knowledge graph API (`/api/rag/knowledge-graph`)

  ```typescript
  GET  /api/rag/knowledge-graph/entities        // List entities
  GET  /api/rag/knowledge-graph/relationships   // List relationships
  GET  /api/rag/knowledge-graph/entity/:id      // Get entity context
  POST /api/rag/knowledge-graph/search          // Semantic search
  POST /api/rag/knowledge-graph/traverse        // Graph traversal
  ```

### Phase 6: Unified Context Enrichment

- [ ] Create context enrichment pipeline (`src/rag/enrichment/pipeline.ts`)

  ```typescript
  export interface EnrichmentPipeline {
    enrich(query: string, options: EnrichmentOptions,): Promise<EnrichedContext>;
  }

  export interface EnrichmentOptions {
    sources: string[]; // Which sources to query
    maxTokens: number; // Token budget
    freshness?: "latest" | "all";
    includeGraph?: boolean; // Include knowledge graph context
    includeFeeds?: boolean; // Include RSS context
    includeChat?: boolean; // Include team chat context
  }

  export interface EnrichedContext {
    documents: SearchResult[];
    webResults: SearchResult[];
    feedItems: SearchResult[];
    chatMessages: SearchResult[];
    graphContext: GraphContext;
    totalTokens: number;
    sources: SourceMetadata[];
  }
  ```

- [ ] Add enrichment to RAG query flow
  - Hook into `ContextInjector`
  - Parallel source querying
  - Token budget allocation across sources
  - Source priority weighting

- [ ] Create enrichment configuration UI (`src/frontend/alpine/enrichment.ts`)
  - Source enable/disable
  - Priority ordering
  - Token budget sliders
  - Freshness preferences
  - Source-specific settings

## Files

- `src/rag/sources/provider.ts` — context source interface
- `src/rag/sources/feed/rss.ts` — RSS/Atom feed
- `src/rag/sources/feed/manager.ts` — feed management
- `src/rag/sources/email/imap.ts` — email integration
- `src/rag/sources/chat/slack.ts` — Slack integration
- `src/rag/sources/chat/discord.ts` — Discord integration
- `src/rag/sources/chat/matrix.ts` — Matrix integration
- `src/rag/sources/database/query.ts` — database queries
- `src/rag/sources/api/rest.ts` — REST API source
- `src/rag/sources/api/webhook.ts` — webhook receiver
- `src/rag/sources/knowledge-graph/index.ts` — knowledge graph
- `src/rag/sources/knowledge-graph/entities.ts` — entity extraction
- `src/rag/sources/knowledge-graph/relationships.ts` — relationship mapping
- `src/rag/enrichment/pipeline.ts` — enrichment pipeline
- `src/rag/enrichment/token-budget.ts` — token allocation
- `src/frontend/alpine/enrichment.ts` — enrichment config UI

## Database Schema

### context_sources

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

### context_source_items

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

### knowledge_graph_entities

```sql
CREATE TABLE knowledge_graph_entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  aliases TEXT[],  -- PostgreSQL array, JSON array for SQLite
  metadata JSONB,
  embedding_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### knowledge_graph_relationships

```sql
CREATE TABLE knowledge_graph_relationships (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES knowledge_graph_entities(id),
  target_id TEXT REFERENCES knowledge_graph_entities(id),
  type TEXT NOT NULL,
  weight FLOAT DEFAULT 1.0,
  metadata JSONB,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Configuration

Add to `src/config/schema.ts`:

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

## Dependencies

- Depends on: `epic-rag-document-processing.md` (core RAG pipeline)
- Depends on: `TASK-rag-search-providers.md` (search provider interface)
- Depends on: `epic-byok-api-keys.md` (API key management)
- Depends on: `epic-encryption-foundation.md` (credential encryption)
- Enables: Enterprise knowledge management, team collaboration context

## Verification

```bash
# Add RSS feed
curl -X POST http://localhost:3000/api/rag/sources/feeds \
  -H "Content-Type: application/json" \
  -d '{"url": "https://news.ycombinator.com/rss", "name": "Hacker News"}'

# Sync feeds
curl -X POST http://localhost:3000/api/rag/sources/feeds/hn-001/sync

# Connect Slack
curl -X POST http://localhost:3000/api/rag/sources/chat/connect \
  -H "Content-Type: application/json" \
  -d '{"type": "slack", "token": "xoxb-...", "channels": ["#general", "#dev"]}'

# Enriched RAG query
curl -X POST http://localhost:3000/api/rag/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What did the team discuss about the new API?",
    "enrichment": {
      "sources": ["chat", "feeds"],
      "maxTokens": 4000
    }
  }'

# Knowledge graph search
curl -X POST http://localhost:3000/api/rag/knowledge-graph/search \
  -H "Content-Type: application/json" \
  -d '{"query": "AI agent framework", "entityTypes": ["concept", "organization"]}'

# List all sources
curl http://localhost:3000/api/rag/sources
```
