<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RAG Context Enrichment Integrations

**Status:** ⬜ Not Started — umbrella; work split into 6 child tickets
**Priority:** Medium
**Effort:** High
**Epic:** epic-rag-document-processing.md

## Summary

Integrate additional context sources beyond documents and web search: RSS feeds, email, Slack/Discord, databases, APIs, and knowledge graphs for comprehensive RAG context enrichment.

## Child Tickets

| Ticket                        | Scope                                                        | Order |
| ----------------------------- | ------------------------------------------------------------ | ----- |
| `TASK-rag-context-schema.md`        | Shared `ContextSource` interface, `context_sources`/`context_source_items` schema, sync framework, config registration | 1st |
| `TASK-rag-feed-sources.md`          | Phase 1: RSS/Atom feeds (reference provider implementation)  | 2nd |
| `TASK-rag-email-source.md`          | Phase 2: IMAP email ingestion                                | after schema |
| `TASK-rag-chat-sources.md`          | Phase 3: Slack/Discord/Matrix team-chat ingestion            | after schema |
| `TASK-rag-knowledge-graph.md`       | Phase 5: entity/relationship graph + API                     | after sources land |
| `TASK-rag-unified-enrichment.md`    | Phase 6: query-time enrichment pipeline + config UI          | last |

## Motivation (shared context)

Rich context requires diverse sources:

- **RSS/Atom feeds** — news, blogs, industry updates
- **Email** — support tickets, internal communications
- **Team chat** — Slack/Discord conversations for institutional knowledge
- **Databases** — structured data queries for factual context
- **APIs** — third-party data sources (CRM, project management)
- **Knowledge graphs** — entity relationships and semantic connections

## Design Principles (shared context)

| Principle                 | Implementation                                         |
| ------------------------- | ------------------------------------------------------ |
| **Source Abstraction**    | Unified `ContextSource` interface for all integrations |
| **Incremental Ingestion** | Delta updates, not full re-indexing                    |
| **Access Scoping**        | Respect source permissions and access controls         |
| **Freshness Tracking**    | Metadata on when content was last updated              |
| **Lazy vs Eager**         | Configurable: fetch on query vs. pre-fetch schedule    |

## Unscheduled backlog (not yet ticketed)

### Phase 4: Database & API Sources

Not split into a child ticket yet; implement after the schema framework proves out with feed/email/chat:

- Database provider (`src/rag/sources/database/query.ts`) — SQL query execution against external databases, schema introspection for context, result-to-document conversion, configurable query templates.
- REST API provider (`src/rag/sources/api/rest.ts`) — generic REST endpoint integration, authentication (API key, OAuth, Bearer), response-to-document conversion, pagination handling.
- Webhook receiver (`src/rag/sources/api/webhook.ts`) — ingest data from external webhooks, configurable payload parsing, real-time ingestion on webhook fire.

## Dependencies

- Depends on: `epic-rag-document-processing.md` (core RAG pipeline)
- Depends on: `TASK-rag-search-providers.md` (search provider interface)
- Depends on: `epic-byok-api-keys.md` (API key management)
- Depends on: `epic-encryption-foundation.md` (credential encryption)
- Enables: Enterprise knowledge management, team collaboration context
