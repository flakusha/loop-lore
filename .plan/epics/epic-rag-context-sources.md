<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: External Search Providers & Context Enrichment

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Low
**Type:** Feature Epic
**Tags:** rag, search-providers, duckduckgo, searxng, brave, tavily, rss, enrichment
**Parent Epic:** RAG & Document Processing (epic-rag-document-processing.md)

## Summary

Extend RAG context beyond local documents: pluggable web search providers (DuckDuckGo, SearXNG, Brave, Google, Bing, Tavily) with local caching for self-hosted/offline use, and context enrichment from external sources — RSS feeds, email, Slack/Discord, databases, and knowledge graphs.

## Scope

- Web search provider abstraction (DuckDuckGo, SearXNG, Brave, Google, Bing, Tavily)
- Local search providers & caching (SQLite FTS5, memory/disk cache, offline mode)
- Context enrichment sources (RSS, email, Slack/Discord, databases, knowledge graph)

## Tasks

### Search Providers & Context Enrichment

- [ ] **TASK-rag-search-providers.md** — Web search providers (DuckDuckGo, SearXNG, Brave, Google, Bing, Tavily)
- [ ] **TASK-rag-local-search-cache.md** — Local search providers & caching (SQLite FTS5, memory/disk cache, offline mode)
- [ ] **TASK-rag-context-enrichment.md** — Context enrichment (RSS, email, Slack/Discord, databases, knowledge graph)

## Dependencies

- **Parent hub:** epic-rag-document-processing.md (shared pipeline interface, cross-cutting concerns)
- **Sequencing:** Independent follow-on to the core pipeline (epic-rag-ingestion.md → epic-rag-vector-store.md → epic-rag-retrieval.md); augments retrieval results but is not required for them. No sibling dependencies.
- External: epic-communications-integrations.md (email/IM ingestion feeds the enrichment sources)

## Related Epics

- **epic-rag-retrieval.md** — consumes external results as additional context
- **epic-communications-integrations.md** — email/IM integration points
