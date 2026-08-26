<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-rag-knowledge-graph: RAG knowledge graph

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Medium
**Type:** TASK
**Tags:** rag, knowledge-graph, entities, relationships
**Epic:** epic-rag-document-processing.md
**Parent:** TASK-rag-context-enrichment (umbrella)

## Summary

Entity extraction and relationship mapping over ingested content with SQLite-backed graph storage and semantic traversal for context.

## Tasks

- [ ] Implement knowledge graph provider (`src/rag/sources/knowledge-graph/index.ts`)
  - Entity extraction from documents
  - Relationship mapping (`entities.ts`, `relationships.ts`)
  - Graph storage (SQLite-based)
  - Semantic traversal for context
- [ ] Add entity types:

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

- [ ] Create `knowledge_graph_entities` table:

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

- [ ] Create `knowledge_graph_relationships` table:

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

- [ ] Create knowledge graph API (`/api/rag/knowledge-graph`):

```typescript
GET  /api/rag/knowledge-graph/entities        // List entities
GET  /api/rag/knowledge-graph/relationships   // List relationships
GET  /api/rag/knowledge-graph/entity/:id      // Get entity context
POST /api/rag/knowledge-graph/search          // Semantic search
POST /api/rag/knowledge-graph/traverse        // Graph traversal
```

## Dependencies

- Depends on: TASK-rag-context-schema (ingestion pipeline feeds extraction); entity extraction runs over items from feed/email/chat sources.
- Parent hub: `TASK-rag-context-enrichment.md`
- Siblings: graph context consumed by TASK-rag-unified-enrichment (`includeGraph`).

Verification sketch:

```bash
curl -X POST http://localhost:3000/api/rag/knowledge-graph/search \
  -H "Content-Type: application/json" \
  -d '{"query": "AI agent framework", "entityTypes": ["concept", "organization"]}'
```
