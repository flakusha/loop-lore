<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-rag-feed-sources: RAG feed sources (RSS/Atom)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** TASK
**Tags:** rag, rss, atom, feeds
**Epic:** epic-rag-document-processing.md
**Parent:** TASK-rag-context-enrichment (umbrella)

## Summary

RSS/Atom feed ingestion — the **reference implementation** of the `ContextSource` interface. All later source providers (email, chat, …) copy this provider's structure.

## Tasks

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
- [ ] Add feed API (`/api/rag/sources/feeds`):

```typescript
POST /api/rag/sources/feeds          // Add feed
GET  /api/rag/sources/feeds          // List feeds
DELETE /api/rag/sources/feeds/:id    // Remove feed
POST /api/rag/sources/feeds/:id/sync // Manual sync
GET  /api/rag/sources/feeds/:id/items // List items
```

## Verification sketch

```bash
# Add RSS feed
curl -X POST http://localhost:3000/api/rag/sources/feeds \
  -H "Content-Type: application/json" \
  -d '{"url": "https://news.ycombinator.com/rss", "name": "Hacker News"}'

# Sync feeds
curl -X POST http://localhost:3000/api/rag/sources/feeds/hn-001/sync
```

## Dependencies

- Depends on: TASK-rag-context-schema (`ContextSource` interface + tables + config wiring).
- Parent hub: `TASK-rag-context-enrichment.md`
- Siblings: TASK-rag-email-source, TASK-rag-chat-sources follow this reference implementation; feeds register into TASK-rag-unified-enrichment.
