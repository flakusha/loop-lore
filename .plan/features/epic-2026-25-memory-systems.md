# Epic 2026-25: Memory Systems

**Status:** Not Started (P2)
**Priority:** High
**Source:** docs/spec/memory-system.md

## Summary

Three-tier memory system (episodic/semantic/procedural), memory visualization, relationship ranking, search optimization.

## Linked Tasks

| Task          | Title                                                       | Priority | Status      |
| ------------- | ----------------------------------------------------------- | -------- | ----------- |
| FEAT-2026-003 | Three-tier memory system (episodic/semantic/procedural)     | High     | Not Started |
| FEAT-2026-008 | Memory selection UI (mid-chat panel, pinning, auto-extract) | Medium   | Not Started |
| FEAT-2026-025 | Memory Visualization Implementation                         | Medium   | Not Started |

## Memory Architecture

### Three-Tier System

| Type       | Storage                             | Retrieval                           |
| ---------- | ----------------------------------- | ----------------------------------- |
| Episodic   | Messages linked to chats/workspaces | Temporal queries, recency weighting |
| Semantic   | Assets with `label='memory'`        | Vector similarity, concept matching |
| Procedural | Actor settings JSON                 | Pattern matching, success rate      |

### Current State

- `actor_memories` table exists with `memory_type`, `keywords`, `importance`, `decay_rate`, `last_accessed_at`
- Keyword filtering implemented in `src/assistant/prompt/sections/memories.ts`
- Memory panel UI exists in `components/chat/memory-panel.html`
- **Missing:** Three-tier system, vector DB backend, memory visualization, relationship ranking

## Implementation Phases

### Phase 1: Backend Abstraction

- [ ] Memory backend abstraction layer (flat DB vs vector DB)
- [ ] Semantic memory extraction from interactions
- [ ] Procedural memory pattern learning

### Phase 2: Search & Optimization

- [ ] Memory search optimization (FTS5 + semantic)
- [ ] Memory relationship ranking
- [ ] Auto-rewording for clarity

### Phase 3: Context Integration

- [ ] Selective memory inclusion in prompts
- [ ] Memory decay implementation
- [ ] Consolidation algorithms

### Phase 4: Visualization

- [ ] Memory graph view
- [ ] Memory timeline view
- [ ] Relationship visualization

## Files

- `src/memory/backend.ts` — Backend abstraction
- `src/memory/search.ts` — Search optimization
- `src/memory/ranking.ts` — Relationship ranking
- `src/memory/extraction.ts` — Semantic extraction
- `src/memory/visualization.ts` — Graph/timeline views
- `src/db/schema-memories.ts` — Memory tables
- `src/assistant/prompt/sections/memories.ts` — Prompt integration
- `src/components/chat/memory-panel.html` — UI
