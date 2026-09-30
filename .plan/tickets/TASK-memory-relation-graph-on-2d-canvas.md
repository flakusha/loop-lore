<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Memory relation graph on 2D canvas

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

<!-- SPDX-License-Identifier: Apache-2.0 --><!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors --><a name="summary"></a>## SummaryRender actor_memories for an actor as a node/edge graph on the shared graph-canvas: memories as nodes, co-occurrence in same source_chat_id / shared keywords as edges.Read-only v1.<a name="context"></a>## ContextDepends on FEAT-generic-2d-graph-canvas-renderer-reusing-game-canvas. Sources: actor_memories (actor_id, source_chat_id, memory_type, importance, keywords, content), memory_embeddings (semantic proximity edge candidate). Read path: src/actors/actor-memories.ts listActorMemories. Related: FEAT-memory-knowledge-graph-visualizer (Done, duplicate-resolved to epic-analytics-observability FEA-2026-058), TASK-rag-knowledge-graph (Not Started, backend entity/relationship storage). This ticket is the memory-domain frontend; it reuses TASK-rag-knowledge-graph storage when it lands, derives edges heuristically until then.<a name="acceptance"></a>## Acceptance Criteria- [ ] GET endpoint returns nodes (id, label, memory_type, importance) + edges (shared chat, shared keyword, embedding proximity) capped at 200 nodes with paging.- [ ] Graph-canvas renders memory nodes color-coded by memory_type, click shows content snippet.- [ ] bun run check green.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
