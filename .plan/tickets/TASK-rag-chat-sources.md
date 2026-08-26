<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-rag-chat-sources: RAG team-chat sources (Slack/Discord/Matrix)

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Small
**Type:** TASK
**Tags:** rag, slack, discord, matrix
**Epic:** epic-rag-document-processing.md
**Parent:** TASK-rag-context-enrichment (umbrella)

## Summary

Team-chat ingestion (Slack/Discord/Matrix) as RAG context sources with thread-context preservation and a unified chat-source API.

## Tasks

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
- [ ] Create unified chat API (`/api/rag/sources/chat`):

```typescript
POST / api / rag / sources / chat / connect; // Configure provider
GET / api / rag / sources / chat / channels; // List channels
POST / api / rag / sources / chat / ingest; // Ingest channel history
GET / api / rag / sources / chat / search; // Search messages
```

## Dependencies

- Depends on: TASK-rag-context-schema; pattern follows TASK-rag-feed-sources.
- Parent hub: `TASK-rag-context-enrichment.md`
- Siblings: registers into TASK-rag-unified-enrichment.
