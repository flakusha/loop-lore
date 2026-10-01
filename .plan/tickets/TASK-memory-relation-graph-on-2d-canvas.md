<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Memory relation graph on 2D canvas

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-memory-knowledge-systems.md
**Tags:** memory-knowledge-systems

**Summary:** Render an actor's memories as a node/edge graph on the shared graph-canvas: memories as nodes, same `source_chat_id` / shared keywords as edges. Read-only v1.

**Context:** Depends on FEAT-generic-2d-graph-canvas-renderer-reusing-game-canvas.

Sources: `actor_memories` (`actor_id`, `source_chat_id`, `memory_type`, `importance`, `keywords`, `content`); `memory_embeddings` (semantic-proximity edge candidate). Read path: `listActorMemories` in `src/actors/actor-memories.ts`.

Related: FEAT-memory-knowledge-graph-visualizer is Done and duplicate-resolved to epic-analytics-observability (FEA-2026-058); TASK-rag-knowledge-graph (Not Started) owns the backend entity/relationship storage. This ticket is the memory-domain frontend — it reuses that storage once it lands and derives edges heuristically until then.

**Acceptance Criteria:**

- [ ] GET endpoint returns nodes (`id`, `label`, `memory_type`, `importance`) and edges (shared chat, shared keyword, embedding proximity), capped at 200 nodes with paging.
- [ ] Graph-canvas renders memory nodes color-coded by `memory_type`; clicking a node shows the content snippet.
- [ ] `bun run check` green.
