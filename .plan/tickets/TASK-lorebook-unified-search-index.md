<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Lorebook unified search index

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Index world_lore_entries/actor_lore_entries into the UnifiedSearchService {kind:lore} scope (FTS5 + vector) with timeline_id, reveal_condition and rarity filters applied pre-ranking so secret lore never surfaces by relevance alone. Binds epic-lore-knowledge to TASK-search-service-unified; shared lore metadata types live in src/types/search.ts per TASK-search-rag-coverage-bridge.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
